package id.tefa.smartgreenhouse.network

import android.util.Base64
import android.util.Log
import id.tefa.smartgreenhouse.model.DashboardSettings
import id.tefa.smartgreenhouse.model.DeviceStatusPayload
import id.tefa.smartgreenhouse.model.NormalizedTelemetry
import id.tefa.smartgreenhouse.model.PayloadNormalizer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory
import kotlin.math.abs

class MqttClientManager(
    private val onConnectionState: (stateText: String, subText: String, isOnline: Boolean) -> Unit,
    private val onTelemetryReceived: (NormalizedTelemetry) -> Unit,
    private val onDeviceStatusReceived: (DeviceStatusPayload) -> Unit
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var connectionJob: Job? = null
    private var pingJob: Job? = null

    @Volatile
    private var brokerUrl: String = DashboardSettings.DEFAULT_BROKER_URL

    @Volatile
    private var sensorTopic: String = DashboardSettings.DEFAULT_TOPIC_SENSOR

    @Volatile
    private var controlTopic: String = DashboardSettings.DEFAULT_TOPIC_CONTROL

    @Volatile
    private var statusTopic: String = DashboardSettings.DEFAULT_TOPIC_STATUS

    @Volatile
    private var connected: Boolean = false

    @Volatile
    private var activeTransport: MqttTransport? = null

    @Volatile
    private var pendingSettingsPayload: String? = null

    private val packetIdGen = AtomicInteger(1)
    private val writeLock = Any()

    fun isConnected(): Boolean = connected

    fun updateConfig(
        nextBrokerRaw: String,
        nextSensorTopic: String,
        nextControlTopic: String,
        nextStatusTopic: String
    ) {
        val normalizedBroker = normalizeBrokerUrl(nextBrokerRaw)
        val cleanSub = nextSensorTopic.trim().ifBlank { DashboardSettings.DEFAULT_TOPIC_SENSOR }
        val cleanPub = nextControlTopic.trim().ifBlank { DashboardSettings.DEFAULT_TOPIC_CONTROL }
        val cleanStatus = nextStatusTopic.trim().ifBlank { DashboardSettings.DEFAULT_TOPIC_STATUS }

        val brokerChanged = normalizedBroker != brokerUrl
        val prevSub = sensorTopic
        val prevStatus = statusTopic

        brokerUrl = normalizedBroker
        sensorTopic = cleanSub
        controlTopic = cleanPub
        statusTopic = cleanStatus

        if (connectionJob == null || brokerChanged) {
            connect()
            return
        }

        if (connected) {
            scope.launch {
                try {
                    if (prevSub != cleanSub) {
                        sendUnsubscribe(prevSub)
                        sendSubscribe(cleanSub)
                        withContext(Dispatchers.Main) {
                            onConnectionState("Online", "Menunggu data...", true)
                        }
                    }
                    if (prevStatus != cleanStatus) {
                        if (prevStatus.isNotBlank()) sendUnsubscribe(prevStatus)
                        if (cleanStatus.isNotBlank() && cleanStatus != cleanSub) {
                            sendSubscribe(cleanStatus)
                        }
                    }
                } catch (_: Exception) {
                    connect()
                }
            }
        }
    }

    fun connect() {
        stopInternal()
        val targetUrl = brokerUrl
        connectionJob = scope.launch {
            var attempt = 0
            while (isActive) {
                attempt++
                withContext(Dispatchers.Main) {
                    val label = if (attempt == 1) "Connecting" else "Reconnect"
                    val desc = if (attempt == 1) "Menghubungkan MQTT..." else "Menyambung ulang..."
                    onConnectionState(label, desc, false)
                }

                var transport: MqttTransport? = null
                try {
                    transport = openTransportWithFallback(targetUrl)
                    activeTransport = transport

                    val clientId = "tefa_andro_" + Integer.toHexString(SecureRandom().nextInt())
                    val connectPacket = encodeConnectPacket(clientId, keepAliveSec = 30)
                    synchronized(writeLock) {
                        transport.writePacket(connectPacket)
                    }

                    val connAck = readMqttPacket(transport)
                    if (connAck.packetType != 2 || connAck.payload.size < 2 || connAck.payload[1].toInt() != 0) {
                        throw IOException("MQTT CONNACK ditolak")
                    }

                    connected = true
                    withContext(Dispatchers.Main) {
                        onConnectionState("Online", "Menunggu data...", true)
                    }

                    val topics = listOf(sensorTopic, statusTopic).filter { it.isNotBlank() }.distinct()
                    for (t in topics) {
                        sendSubscribe(t)
                    }

                    val queued = pendingSettingsPayload
                    if (queued != null) {
                        pendingSettingsPayload = null
                        sendPublish(controlTopic, queued, qos = 1, retain = true)
                    }

                    pingJob?.cancel()
                    pingJob = launch {
                        while (isActive && connected) {
                            delay(25_000L)
                            try {
                                synchronized(writeLock) {
                                    activeTransport?.writePacket(byteArrayOf(0xC0.toByte(), 0x00))
                                }
                            } catch (_: Exception) {
                                break
                            }
                        }
                    }

                    while (isActive) {
                        val pkt = readMqttPacket(transport)
                        when (pkt.packetType) {
                            3 -> handleIncomingPublish(pkt)
                            4 -> Unit // PUBACK
                            9 -> Unit // SUBACK
                            11 -> Unit // UNSUBACK
                            13 -> Unit // PINGRESP
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "MQTT koneksi terputus: ${e.message}")
                } finally {
                    connected = false
                    pingJob?.cancel()
                    pingJob = null
                    activeTransport = null
                    try {
                        transport?.close()
                    } catch (_: Exception) {
                    }
                }

                if (!isActive) break
                withContext(Dispatchers.Main) {
                    onConnectionState("Offline", "Terputus · Reconnect 4d...", false)
                }
                delay(4000L)
            }
        }
    }

    fun publishControl(payloadJson: String): String {
        return if (connected && activeTransport != null) {
            scope.launch {
                try {
                    sendPublish(controlTopic, payloadJson, qos = 1, retain = true)
                } catch (e: Exception) {
                    Log.w(TAG, "Gagal publish control: ${e.message}")
                    pendingSettingsPayload = payloadJson
                }
            }
            "sent"
        } else {
            pendingSettingsPayload = payloadJson
            "queued"
        }
    }

    fun disconnect() {
        stopInternal()
    }

    private fun stopInternal() {
        connected = false
        pingJob?.cancel()
        pingJob = null
        connectionJob?.cancel()
        connectionJob = null
        try {
            activeTransport?.close()
        } catch (_: Exception) {
        }
        activeTransport = null
    }

    private suspend fun handleIncomingPublish(pkt: MqttPacket) {
        val retain = (pkt.flags and 0x01) != 0
        val qos = (pkt.flags ushr 1) and 0x03
        val data = pkt.payload
        if (data.size < 2) return

        val topicLen = ((data[0].toInt() and 0xFF) shl 8) or (data[1].toInt() and 0xFF)
        var offset = 2
        if (offset + topicLen > data.size) return
        val topic = String(data, offset, topicLen, Charsets.UTF_8)
        offset += topicLen

        if (qos > 0) {
            if (offset + 2 > data.size) return
            val packetIdHigh = data[offset]
            val packetIdLow = data[offset + 1]
            offset += 2
            if (qos == 1) {
                try {
                    synchronized(writeLock) {
                        activeTransport?.writePacket(
                            byteArrayOf(0x40, 0x02, packetIdHigh, packetIdLow)
                        )
                    }
                } catch (_: Exception) {
                }
            }
        }

        // Abaikan pesan retained lama dari broker agar tidak muncul saat sensor mati
        if (retain) {
            Log.d(TAG, "Mengabaikan pesan retained lama dari [$topic]")
            return
        }

        if (topic != sensorTopic && topic != statusTopic) {
            return
        }

        val rawPayload = String(data, offset, data.size - offset, Charsets.UTF_8)
        val statusParsed = PayloadNormalizer.parseDeviceStatus(rawPayload)
        if (topic == statusTopic || statusParsed != null) {
            if (statusParsed != null) {
                withContext(Dispatchers.Main) {
                    onDeviceStatusReceived(statusParsed)
                }
            }
        }

        if (topic == sensorTopic) {
            val normalized = PayloadNormalizer.normalizePayload(rawPayload)
            if (normalized != null) {
                withContext(Dispatchers.Main) {
                    onTelemetryReceived(normalized)
                }
            }
        }
    }

    private fun sendSubscribe(topic: String) {
        val packetId = nextPacketId()
        val topicBytes = topic.toByteArray(Charsets.UTF_8)
        val payload = ByteArrayOutputStream()
        payload.write((packetId ushr 8) and 0xFF)
        payload.write(packetId and 0xFF)
        payload.write((topicBytes.size ushr 8) and 0xFF)
        payload.write(topicBytes.size and 0xFF)
        payload.write(topicBytes)
        payload.write(0) // QoS 0
        val body = payload.toByteArray()
        val packet = wrapMqttPacket(0x82, body)
        synchronized(writeLock) {
            activeTransport?.writePacket(packet)
        }
    }

    private fun sendUnsubscribe(topic: String) {
        val packetId = nextPacketId()
        val topicBytes = topic.toByteArray(Charsets.UTF_8)
        val payload = ByteArrayOutputStream()
        payload.write((packetId ushr 8) and 0xFF)
        payload.write(packetId and 0xFF)
        payload.write((topicBytes.size ushr 8) and 0xFF)
        payload.write(topicBytes.size and 0xFF)
        payload.write(topicBytes)
        val body = payload.toByteArray()
        val packet = wrapMqttPacket(0xA2, body)
        synchronized(writeLock) {
            activeTransport?.writePacket(packet)
        }
    }

    private fun sendPublish(topic: String, message: String, qos: Int, retain: Boolean) {
        val topicBytes = topic.toByteArray(Charsets.UTF_8)
        val msgBytes = message.toByteArray(Charsets.UTF_8)
        val payload = ByteArrayOutputStream()
        payload.write((topicBytes.size ushr 8) and 0xFF)
        payload.write(topicBytes.size and 0xFF)
        payload.write(topicBytes)
        if (qos > 0) {
            val packetId = nextPacketId()
            payload.write((packetId ushr 8) and 0xFF)
            payload.write(packetId and 0xFF)
        }
        payload.write(msgBytes)
        var header = 0x30
        if (qos == 1) header = header or 0x02
        if (retain) header = header or 0x01
        val packet = wrapMqttPacket(header, payload.toByteArray())
        synchronized(writeLock) {
            activeTransport?.writePacket(packet)
        }
    }

    private fun nextPacketId(): Int {
        val next = packetIdGen.getAndIncrement()
        if (next > 65000) {
            packetIdGen.set(1)
            return 1
        }
        return next
    }

    private fun encodeConnectPacket(clientId: String, keepAliveSec: Int): ByteArray {
        val body = ByteArrayOutputStream()
        // Protocol Name "MQTT"
        body.write(0x00)
        body.write(0x04)
        body.write("MQTT".toByteArray(Charsets.UTF_8))
        // Protocol Level 4 (MQTT 3.1.1)
        body.write(0x04)
        // Connect Flags: Clean Session (0x02)
        body.write(0x02)
        // Keep Alive
        body.write((keepAliveSec ushr 8) and 0xFF)
        body.write(keepAliveSec and 0xFF)
        // Client Identifier
        val idBytes = clientId.toByteArray(Charsets.UTF_8)
        body.write((idBytes.size ushr 8) and 0xFF)
        body.write(idBytes.size and 0xFF)
        body.write(idBytes)
        return wrapMqttPacket(0x10, body.toByteArray())
    }

    private fun wrapMqttPacket(headerByte: Int, body: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(body.size + 5)
        out.write(headerByte)
        var remLen = body.size
        do {
            var digit = remLen % 128
            remLen /= 128
            if (remLen > 0) digit = digit or 0x80
            out.write(digit)
        } while (remLen > 0)
        out.write(body)
        return out.toByteArray()
    }

    private fun readMqttPacket(transport: MqttTransport): MqttPacket {
        val header = transport.readByte()
        if (header < 0) throw EOFException("Stream closed")
        val packetType = (header ushr 4) and 0x0F
        val flags = header and 0x0F

        var multiplier = 1
        var value = 0
        var encodedByte: Int
        do {
            encodedByte = transport.readByte()
            if (encodedByte < 0) throw EOFException("Stream closed while reading length")
            value += (encodedByte and 127) * multiplier
            if (multiplier > 128 * 128 * 128) throw IOException("Malformed remaining length")
            multiplier *= 128
        } while ((encodedByte and 128) != 0)

        val payload = ByteArray(value)
        var read = 0
        while (read < value) {
            val b = transport.readByte()
            if (b < 0) throw EOFException("Stream closed inside payload")
            payload[read++] = b.toByte()
        }
        return MqttPacket(packetType, flags, payload)
    }

    private fun openTransportWithFallback(url: String): MqttTransport {
        return try {
            openTransport(url)
        } catch (primaryEx: Exception) {
            val uri = URI(url)
            val scheme = uri.scheme?.lowercase() ?: "wss"
            if ((scheme == "ws" || scheme == "wss") && !uri.host.isNullOrBlank()) {
                val tcpPort = if (scheme == "wss") 8883 else 1883
                val tcpUrl = (if (scheme == "wss") "ssl://" else "tcp://") + uri.host + ":" + tcpPort
                Log.w(TAG, "WebSocket gagal (${primaryEx.message}), mencoba fallback $tcpUrl")
                try {
                    openTransport(tcpUrl)
                } catch (_: Exception) {
                    if (scheme == "wss") {
                        openTransport("tcp://${uri.host}:1883")
                    } else {
                        throw primaryEx
                    }
                }
            } else {
                throw primaryEx
            }
        }
    }

    private fun openTransport(url: String): MqttTransport {
        val uri = URI(url)
        val scheme = (uri.scheme ?: "wss").lowercase()
        val host = uri.host ?: throw IOException("Host MQTT tidak valid: $url")
        val port = when {
            uri.port > 0 -> uri.port
            scheme == "wss" -> 8084
            scheme == "ws" -> 8083
            scheme == "ssl" || scheme == "mqtts" -> 8883
            else -> 1883
        }
        val useTls = scheme == "wss" || scheme == "ssl" || scheme == "mqtts"

        val socket: Socket = if (useTls) {
            val raw = SSLSocketFactory.getDefault().createSocket() as SSLSocket
            raw.connect(InetSocketAddress(host, port), 10_000)
            raw.soTimeout = 45_000
            raw.startHandshake()
            raw
        } else {
            Socket().apply {
                connect(InetSocketAddress(host, port), 10_000)
                soTimeout = 45_000
            }
        }

        if (scheme == "ws" || scheme == "wss") {
            val path = (uri.rawPath?.takeIf { it.isNotBlank() } ?: "/mqtt") +
                (uri.rawQuery?.let { "?$it" } ?: "")
            return WebSocketMqttTransport(socket, host, port, path)
        }
        return TcpMqttTransport(socket)
    }

    private data class MqttPacket(val packetType: Int, val flags: Int, val payload: ByteArray)

    private interface MqttTransport {
        fun readByte(): Int
        fun writePacket(bytes: ByteArray)
        fun close()
    }

    private class TcpMqttTransport(private val socket: Socket) : MqttTransport {
        private val input: InputStream = socket.getInputStream()
        private val output: OutputStream = socket.getOutputStream()

        override fun readByte(): Int = input.read()

        override fun writePacket(bytes: ByteArray) {
            output.write(bytes)
            output.flush()
        }

        override fun close() {
            socket.close()
        }
    }

    private class WebSocketMqttTransport(
        private val socket: Socket,
        host: String,
        port: Int,
        path: String
    ) : MqttTransport {
        private val input: InputStream = socket.getInputStream()
        private val output: OutputStream = socket.getOutputStream()
        private val rng = SecureRandom()

        private var frameBuffer: ByteArray = ByteArray(0)
        private var frameOffset: Int = 0

        init {
            val nonce = ByteArray(16)
            rng.nextBytes(nonce)
            val wsKey = Base64.encodeToString(nonce, Base64.NO_WRAP)
            val hostHeader = if (port == 80 || port == 443) host else "$host:$port"
            val req = buildString {
                append("GET ").append(path).append(" HTTP/1.1\r\n")
                append("Host: ").append(hostHeader).append("\r\n")
                append("Upgrade: websocket\r\n")
                append("Connection: Upgrade\r\n")
                append("Sec-WebSocket-Key: ").append(wsKey).append("\r\n")
                append("Sec-WebSocket-Version: 13\r\n")
                append("Sec-WebSocket-Protocol: mqtt\r\n")
                append("\r\n")
            }
            output.write(req.toByteArray(Charsets.UTF_8))
            output.flush()

            val headerBytes = ByteArrayOutputStream()
            var state = 0
            while (true) {
                val b = input.read()
                if (b < 0) throw EOFException("WebSocket handshake closed")
                headerBytes.write(b)
                state = when {
                    b == '\r'.code && (state == 0 || state == 2) -> state + 1
                    b == '\n'.code && (state == 1 || state == 3) -> state + 1
                    else -> 0
                }
                if (state == 4) break
                if (headerBytes.size() > 8192) throw IOException("Handshake header too large")
            }
            val resp = headerBytes.toString("UTF-8")
            if (!resp.startsWith("HTTP/1.1 101") && !resp.startsWith("HTTP/1.0 101")) {
                throw IOException("WebSocket upgrade gagal: ${resp.lineSequence().firstOrNull()}")
            }
        }

        override fun readByte(): Int {
            while (frameOffset >= frameBuffer.size) {
                if (!readNextFrame()) return -1
            }
            return frameBuffer[frameOffset++].toInt() and 0xFF
        }

        override fun writePacket(bytes: ByteArray) {
            writeWsFrame(opcode = 0x02, payload = bytes)
        }

        private fun writeWsFrame(opcode: Int, payload: ByteArray) {
            val out = ByteArrayOutputStream(payload.size + 14)
            out.write(0x80 or (opcode and 0x0F))
            val len = payload.size
            when {
                len <= 125 -> out.write(0x80 or len)
                len <= 65535 -> {
                    out.write(0x80 or 126)
                    out.write((len ushr 8) and 0xFF)
                    out.write(len and 0xFF)
                }
                else -> {
                    out.write(0x80 or 127)
                    val l = len.toLong()
                    for (shift in 56 downTo 0 step 8) {
                        out.write(((l ushr shift) and 0xFF).toInt())
                    }
                }
            }
            val mask = ByteArray(4)
            rng.nextBytes(mask)
            out.write(mask)
            for (i in payload.indices) {
                out.write((payload[i].toInt() xor mask[i % 4].toInt()) and 0xFF)
            }
            output.write(out.toByteArray())
            output.flush()
        }

        private fun readNextFrame(): Boolean {
            while (true) {
                val b1 = input.read()
                if (b1 < 0) return false
                val b2 = input.read()
                if (b2 < 0) return false

                val opcode = b1 and 0x0F
                val masked = (b2 and 0x80) != 0
                var len = (b2 and 0x7F).toLong()
                if (len == 126L) {
                    val hi = readRequiredByte()
                    val lo = readRequiredByte()
                    len = ((hi shl 8) or lo).toLong()
                } else if (len == 127L) {
                    var fullLen = 0L
                    for (i in 0 until 8) {
                        fullLen = (fullLen shl 8) or readRequiredByte().toLong()
                    }
                    len = fullLen
                }

                val maskKey = if (masked) {
                    ByteArray(4) { readRequiredByte().toByte() }
                } else null

                val payloadLen = abs(len.toInt())
                val payload = ByteArray(payloadLen)
                var read = 0
                while (read < payloadLen) {
                    val n = input.read(payload, read, payloadLen - read)
                    if (n < 0) return false
                    read += n
                }
                if (maskKey != null) {
                    for (i in payload.indices) {
                        payload[i] = (payload[i].toInt() xor maskKey[i % 4].toInt()).toByte()
                    }
                }

                when (opcode) {
                    0x08 -> return false // CLOSE
                    0x09 -> {
                        // PING -> PONG
                        try {
                            writeWsFrame(0x0A, payload)
                        } catch (_: Exception) {
                        }
                    }
                    0x0A -> Unit // PONG
                    else -> {
                        if (payload.isNotEmpty()) {
                            frameBuffer = payload
                            frameOffset = 0
                            return true
                        }
                    }
                }
            }
        }

        private fun readRequiredByte(): Int {
            val b = input.read()
            if (b < 0) throw EOFException("Unexpected EOF in WebSocket frame")
            return b
        }

        override fun close() {
            socket.close()
        }
    }

    companion object {
        private const val TAG = "TeFaMqtt"

        fun isLocalHost(host: String): Boolean {
            val h = host.split(":")[0].lowercase()
            if (h == "localhost" || h == "127.0.0.1") return true
            return Regex("^(192\\.168\\.|10\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.)").containsMatchIn(h)
        }

        fun normalizeBrokerUrl(input: String?): String {
            if (input.isNullOrBlank()) return DashboardSettings.DEFAULT_BROKER_URL
            var raw = input.trim()
            if (raw.matches(Regex("^wss?://.*", RegexOption.IGNORE_CASE))) {
                val m = Regex("^(wss?://)([^/]+)(/.*)?$", RegexOption.IGNORE_CASE).find(raw)
                if (m != null) {
                    val scheme = m.groupValues[1].lowercase()
                    val hostPart = m.groupValues[2]
                    var pathPart = m.groupValues[3]
                    if (pathPart.isEmpty() && Regex("emqx|hivemq", RegexOption.IGNORE_CASE).containsMatchIn(hostPart)) {
                        pathPart = "/mqtt"
                    }
                    return scheme + hostPart + pathPart
                }
                return raw
            }

            if (raw.matches(Regex("^(ssl|mqtts)://.*", RegexOption.IGNORE_CASE))) {
                return raw
            }

            raw = raw.replace(Regex("^(mqtt|tcp)://", RegexOption.IGNORE_CASE), "")
            val slashIdx = raw.indexOf('/')
            var hostPort = if (slashIdx == -1) raw else raw.substring(0, slashIdx)
            val pathStr = if (slashIdx == -1) "/mqtt" else raw.substring(slashIdx).ifEmpty { "/mqtt" }

            if (!hostPort.contains(':')) {
                hostPort += ":8084"
            } else if (hostPort.endsWith(":1883")) {
                hostPort = hostPort.replace(Regex(":1883$"), ":8084")
            }

            val scheme = if (isLocalHost(hostPort)) "ws://" else "wss://"
            return scheme + hostPort + pathStr
        }
    }
}
