package id.tefa.smartgreenhouse.model

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.floor
import kotlin.math.max

data class SensorItem(
    val id: String,
    val name: String,
    val value: Double?,
    val satuan: String,
    val temperature: Double? = null,
    val humidity: Double? = null,
    val satuan_temp: String? = null,
    val satuan_hum: String? = null
)

data class NormalizedTelemetry(
    val deviceId: String,
    val timestamp: String,
    val wifiRssi: Double?,
    val ph: Double?,
    val ec: Double?,
    val light: Double?,
    val airTemp: Double?,
    val airHum: Double?,
    val waterTemp: Double?,
    val reservoirTemp: Double?,
    val pompaStatus: String?,
    val deepSleepSec: Int? = null,
    val wifiUnit: String = "dBm",
    val ecUnit: String = "mS/cm",
    val lightUnit: String = "Lux"
)

data class DeviceStatusPayload(
    val deviceId: String,
    val statusMessage: String,
    val activeIntervalMinutes: Int?,
    val pumpsStatus: Map<String, String>,
    val timestamp: String? = null
)

data class ControlPayload(
    val interval_minutes: Int,
    val pumps: Map<String, String>,
    val threshold: ThresholdPayload
)

data class ThresholdPayload(
    val ph_min: Double,
    val ph_max: Double,
    val ec_target: Double,
    val ph_up_dose_sec: Double,
    val ph_down_dose_sec: Double
)

data class TelemetryLogPoint(
    val ts: Long,
    val time: String,
    val ph: Double,
    val ec: Double,
    val waterTemp: Double,
    val airTemp: Double,
    val airHum: Double?,
    val light: Double
)

data class ChartPoint(
    val ts: Long,
    val time: String,
    val axisLabel: String,
    val ph: Double,
    val ec: Double,
    val waterTemp: Double
)

data class ChartSeriesResult(
    val points: List<ChartPoint>,
    val label: String
)

data class SensorHistoryRow(
    val time: String,
    val ph: String,
    val ppm: String,
    val temp: String,
    val light: String,
    val hum: String,
    val status: String
)

data class AwsHistoryRow(
    val time: String,
    val temp: String,
    val hum: String,
    val solar: String
)

data class SensorNotification(
    val type: String, // "warning" or "normal"
    val tag: String,
    val time: String,
    val title: String,
    val desc: String,
    val value: String
)

data class AuthSession(
    val username: String,
    val role: String, // "viewer" or "admin"
    val loginTime: String
)

data class ParsedThresholds(
    val phMin: Double,
    val phMax: Double,
    val ecMin: Double,
    val ecMax: Double,
    val tempMin: Double,
    val tempMax: Double,
    val humMin: Double,
    val humMax: Double
)

data class DashboardSettings(
    val phMin: String = "5.5",
    val phMax: String = "6.5",
    val tdsMin: String = "1.0",
    val tdsMax: String = "2.5",
    val tempMin: String = "20",
    val tempMax: String = "30",
    val humMin: String = "50",
    val humMax: String = "85",
    val mqttBroker: String = DEFAULT_BROKER_URL,
    val mqttTopicSub: String = DEFAULT_TOPIC_SENSOR,
    val mqttTopicPub: String = DEFAULT_TOPIC_CONTROL,
    val mqttTopicStatus: String = DEFAULT_TOPIC_STATUS,
    val intervalMinutes: String = "1",
    val pump_A: String = "off",
    val pump_B: String = "off",
    val pump_up: String = "off",
    val pump_down: String = "off",
    val pump_big: String = "off",
    val ecTarget: String = "1.5",
    val phUpDose: String = "2",
    val phDownDose: String = "2",
    val interval: String = "3",
    val aiProvider: String = "gemini",
    val apiKey: String = ""
) {
    fun parsedThresholds(): ParsedThresholds {
        val rawEcMin = tdsMin.replace(",", ".").toDoubleOrNull()
        val rawEcMax = tdsMax.replace(",", ".").toDoubleOrNull()
        return ParsedThresholds(
            phMin = phMin.replace(",", ".").toDoubleOrNull() ?: 5.5,
            phMax = phMax.replace(",", ".").toDoubleOrNull() ?: 6.5,
            ecMin = if (rawEcMin != null && rawEcMin in 0.0..20.0) rawEcMin else 1.0,
            ecMax = if (rawEcMax != null && rawEcMax > 0.0 && rawEcMax <= 20.0) rawEcMax else 2.5,
            tempMin = tempMin.replace(",", ".").toDoubleOrNull() ?: 20.0,
            tempMax = tempMax.replace(",", ".").toDoubleOrNull() ?: 30.0,
            humMin = humMin.replace(",", ".").toDoubleOrNull() ?: 50.0,
            humMax = humMax.replace(",", ".").toDoubleOrNull() ?: 85.0
        )
    }

    fun getPumpState(pumpKey: String): String {
        return when (pumpKey) {
            "pump_A" -> pump_A
            "pump_B" -> pump_B
            "pump_up" -> pump_up
            "pump_down" -> pump_down
            "pump_big" -> pump_big
            else -> "off"
        }
    }

    fun withPumpState(pumpKey: String, state: String): DashboardSettings {
        val norm = if (state.equals("on", ignoreCase = true)) "on" else "off"
        return when (pumpKey) {
            "pump_A" -> copy(pump_A = norm)
            "pump_B" -> copy(pump_B = norm)
            "pump_up" -> copy(pump_up = norm)
            "pump_down" -> copy(pump_down = norm)
            "pump_big" -> copy(pump_big = norm)
            else -> this
        }
    }

    companion object {
        const val DEFAULT_BROKER_URL = "wss://broker.emqx.io:8084/mqtt"
        const val DEFAULT_TOPIC_SENSOR = "tefa/hidroponik/sensor"
        const val DEFAULT_TOPIC_CONTROL = "tefa/hidroponik/control"
        const val DEFAULT_TOPIC_STATUS = "tefa/hidroponik/status"
        val PUMP_KEYS = listOf("pump_A", "pump_B", "pump_up", "pump_down", "pump_big")
    }
}

data class WibDateParts(
    val dd: String,
    val mm: String,
    val hh: String,
    val mi: String,
    val ss: String
)

object TimeRangeAggregator {
    private val wibTz: TimeZone = TimeZone.getTimeZone("Asia/Jakarta")
    private val utcTz: TimeZone = TimeZone.getTimeZone("UTC")

    private val indonesianDays = arrayOf(
        "Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"
    )
    private val indonesianMonths = arrayOf(
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    )
    val monthsShort = arrayOf(
        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
    )

    fun nowIsoUtc(): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = utcTz
        return fmt.format(Date())
    }

    fun parseIsoTimestampMillis(isoString: String?): Long? {
        if (isoString.isNullOrBlank()) return null
        val trimmed = isoString.trim()
        val patterns = arrayOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss"
        )
        for (pattern in patterns) {
            try {
                val sdf = SimpleDateFormat(pattern, Locale.US)
                if (!pattern.contains("XXX")) {
                    sdf.timeZone = utcTz
                }
                val parsed = sdf.parse(trimmed)
                if (parsed != null) return parsed.time
            } catch (_: Exception) {
            }
        }
        return null
    }

    fun getWibDateParts(ts: Long): WibDateParts {
        val cal = Calendar.getInstance(wibTz, Locale.US)
        cal.timeInMillis = ts
        return WibDateParts(
            dd = String.format(Locale.US, "%02d", cal.get(Calendar.DAY_OF_MONTH)),
            mm = String.format(Locale.US, "%02d", cal.get(Calendar.MONTH) + 1),
            hh = String.format(Locale.US, "%02d", cal.get(Calendar.HOUR_OF_DAY)),
            mi = String.format(Locale.US, "%02d", cal.get(Calendar.MINUTE)),
            ss = String.format(Locale.US, "%02d", cal.get(Calendar.SECOND))
        )
    }

    fun formatShortDate(ts: Long): String {
        val p = getWibDateParts(ts)
        return "${p.dd}/${p.mm}"
    }

    fun formatClock(ts: Long, withSec: Boolean): String {
        val p = getWibDateParts(ts)
        return if (withSec) "${p.hh}:${p.mi}:${p.ss}" else "${p.hh}:${p.mi}"
    }

    fun formatWibTime(isoString: String?): String {
        val ts = parseIsoTimestampMillis(isoString) ?: System.currentTimeMillis()
        return formatClock(ts, true)
    }

    fun formatDisplayTimeWithDate(isoString: String?): String {
        val ts = parseIsoTimestampMillis(isoString) ?: return "--:--:--"
        val nowCal = Calendar.getInstance(wibTz, Locale.US)
        val targetCal = Calendar.getInstance(wibTz, Locale.US).apply { timeInMillis = ts }
        val isToday = nowCal.get(Calendar.YEAR) == targetCal.get(Calendar.YEAR) &&
            nowCal.get(Calendar.MONTH) == targetCal.get(Calendar.MONTH) &&
            nowCal.get(Calendar.DAY_OF_MONTH) == targetCal.get(Calendar.DAY_OF_MONTH)
        val t = formatClock(ts, true)
        return if (isToday) t else "${formatShortDate(ts)} $t"
    }

    fun formatFullIndonesianDate(ts: Long = System.currentTimeMillis()): String {
        val cal = Calendar.getInstance(wibTz, Locale.US)
        cal.timeInMillis = ts
        val dayName = indonesianDays[cal.get(Calendar.DAY_OF_WEEK) - 1]
        val dayNum = cal.get(Calendar.DAY_OF_MONTH)
        val monthName = indonesianMonths[cal.get(Calendar.MONTH)]
        val year = cal.get(Calendar.YEAR)
        val hh = String.format(Locale.US, "%02d", cal.get(Calendar.HOUR_OF_DAY))
        val mm = String.format(Locale.US, "%02d", cal.get(Calendar.MINUTE))
        return "$dayName, $dayNum $monthName $year · $hh:$mm WIB"
    }

    fun getSeriesForRange(telemetryLog: List<TelemetryLogPoint>, rangeKeyRaw: String): ChartSeriesResult {
        if (telemetryLog.isEmpty()) return ChartSeriesResult(emptyList(), "")
        val rangeKey = rangeKeyRaw.trim().uppercase(Locale.US)
        val latestTs = telemetryLog.last().ts
        var windowMs = 24L * 3600L * 1000L
        var desc = "24 Jam Terakhir"

        when (rangeKey) {
            "1J" -> {
                windowMs = 1L * 3600L * 1000L
                desc = "1 Jam Terakhir (Detail)"
            }
            "24J" -> {
                windowMs = 24L * 3600L * 1000L
                desc = "24 Jam Terakhir"
            }
            "7H" -> {
                windowMs = 7L * 24L * 3600L * 1000L
                desc = "7 Hari Terakhir"
            }
            "30H" -> {
                windowMs = 30L * 24L * 3600L * 1000L
                desc = "30 Hari Terakhir"
            }
        }

        var filtered = telemetryLog.filter { it.ts >= (latestTs - windowMs) }
        if (filtered.isEmpty()) {
            filtered = telemetryLog.takeLast(20)
        }

        if (rangeKey == "1J") {
            val rawPts = filtered.takeLast(20).map { p ->
                val t = p.time.ifBlank { formatClock(p.ts, true) }
                ChartPoint(
                    ts = p.ts,
                    time = t,
                    axisLabel = t,
                    ph = p.ph,
                    ec = p.ec,
                    waterTemp = p.waterTemp
                )
            }
            return ChartSeriesResult(rawPts, "$desc · ${rawPts.size} titik")
        }

        val span = max(1L, filtered.last().ts - filtered.first().ts)
        val bucketMs: Long = when (rangeKey) {
            "24J" -> when {
                span > 3L * 3600L * 1000L -> 15L * 60L * 1000L
                span > 30L * 60L * 1000L -> 2L * 60L * 1000L
                span > 2L * 60L * 1000L -> 30L * 1000L
                else -> 10L * 1000L
            }
            "7H" -> when {
                span > 24L * 3600L * 1000L -> 3L * 3600L * 1000L
                span > 2L * 3600L * 1000L -> 30L * 60L * 1000L
                else -> 60L * 1000L
            }
            else -> when {
                span > 48L * 3600L * 1000L -> 24L * 3600L * 1000L
                span > 6L * 3600L * 1000L -> 4L * 3600L * 1000L
                else -> 5L * 60L * 1000L
            }
        }

        class BucketAcc(
            var sumPh: Double = 0.0,
            var sumEc: Double = 0.0,
            var sumTemp: Double = 0.0,
            var count: Int = 0,
            val ts: Long,
            var lastTs: Long,
            var lastTime: String
        )

        val buckets = LinkedHashMap<Long, BucketAcc>()
        for (p in filtered) {
            val bKey = floor(p.ts.toDouble() / bucketMs.toDouble()).toLong() * bucketMs
            val acc = buckets[bKey] ?: BucketAcc(ts = bKey, lastTs = p.ts, lastTime = p.time).also {
                buckets[bKey] = it
            }
            acc.sumPh += p.ph
            acc.sumEc += p.ec
            acc.sumTemp += p.waterTemp
            acc.count += 1
            if (p.ts >= acc.lastTs) {
                acc.lastTs = p.ts
                acc.lastTime = p.time
            }
        }

        val agg = buckets.values.toList().takeLast(35).map { b ->
            val refTs = if (b.lastTs > 0) b.lastTs else b.ts
            val axisLbl: String
            val fullTime: String
            when (rangeKey) {
                "24J" -> {
                    axisLbl = if (span < 2L * 60L * 1000L) formatClock(refTs, true) else formatClock(refTs, false)
                    fullTime = formatClock(refTs, true)
                }
                "7H" -> {
                    axisLbl = "${formatShortDate(refTs)} ${formatClock(refTs, false)}"
                    fullTime = "${formatShortDate(refTs)} · ${formatClock(refTs, false)}"
                }
                else -> {
                    axisLbl = if (span > 48L * 3600L * 1000L) {
                        formatShortDate(refTs)
                    } else {
                        "${formatShortDate(refTs)} ${formatClock(refTs, false)}"
                    }
                    fullTime = "${formatShortDate(refTs)} · ${formatClock(refTs, false)}"
                }
            }
            ChartPoint(
                ts = refTs,
                time = fullTime,
                axisLabel = axisLbl,
                ph = b.sumPh / b.count,
                ec = b.sumEc / b.count,
                waterTemp = b.sumTemp / b.count
            )
        }

        return ChartSeriesResult(agg, "$desc · ${agg.size} interval")
    }
}

object PayloadNormalizer {

    fun toDoubleOrNull(v: Any?): Double? {
        if (v == null || v === JSONObject.NULL) return null
        return when (v) {
            is JsonElement -> {
                if (v.isJsonNull || !v.isJsonPrimitive) null
                else {
                    val prim = v.asJsonPrimitive
                    when {
                        prim.isNumber -> {
                            val d = prim.asDouble
                            if (d.isNaN() || d.isInfinite()) null else d
                        }
                        prim.isString -> {
                            val s = prim.asString.trim().replace(",", ".")
                            if (s.isEmpty()) null else s.toDoubleOrNull()
                        }
                        else -> null
                    }
                }
            }
            is Number -> {
                val d = v.toDouble()
                if (d.isNaN() || d.isInfinite()) null else d
            }
            is String -> {
                val s = v.trim().replace(",", ".")
                if (s.isEmpty()) null else s.toDoubleOrNull()
            }
            else -> null
        }
    }

    private fun JsonObject.optStringCompat(key: String, fallback: String = ""): String {
        val el = get(key) ?: return fallback
        if (el.isJsonNull || !el.isJsonPrimitive) return fallback
        return el.asString ?: fallback
    }

    private fun JsonObject.optObjectCompat(key: String): JsonObject? {
        val el = get(key) ?: return null
        return if (el.isJsonObject) el.asJsonObject else null
    }

    private fun JsonObject.optArrayCompat(key: String): JsonArray? {
        val el = get(key) ?: return null
        return if (el.isJsonArray) el.asJsonArray else null
    }

    fun normalizePayload(rawJson: String): NormalizedTelemetry? {
        return try {
            val parsed = JsonParser.parseString(rawJson)
            if (!parsed.isJsonObject) return null
            var root = parsed.asJsonObject
            val dataObj = root.optObjectCompat("data")
            val dObj = root.optObjectCompat("d")
            if (dataObj != null) {
                root = mergeObjects(root, dataObj)
            } else if (dObj != null) {
                root = mergeObjects(root, dObj)
            }

            val sensorsArr = root.optArrayCompat("sensors")
            if (sensorsArr != null) {
                parseSensorArrayPayload(root, sensorsArr)
            } else {
                parseFlatPayload(root)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun mergeObjects(base: JsonObject, overlay: JsonObject): JsonObject {
        val merged = JsonObject()
        for ((k, v) in base.entrySet()) {
            merged.add(k, v)
        }
        for ((k, v) in overlay.entrySet()) {
            merged.add(k, v)
        }
        return merged
    }

    private fun parseSensorArrayPayload(root: JsonObject, arr: JsonArray): NormalizedTelemetry? {
        val sensorMap = HashMap<String, JsonObject>()
        for (el in arr) {
            if (!el.isJsonObject) continue
            val obj = el.asJsonObject
            val id = obj.optStringCompat("id", "").trim()
            if (id.isNotEmpty()) sensorMap[id] = obj
        }

        val wifiItem = pickSensor(sensorMap, listOf("TEL-WIFI-001", "kekuatan_wiFi"), "dBm")
        val phItem = pickSensor(sensorMap, listOf("SNS-PH-001", "001pH"), "pH")
        val ecItem = pickSensor(sensorMap, listOf("SNS-EC-002", "002EC"), "mS/cm")
        val lightItem = pickSensor(sensorMap, listOf("SNS-BH-003", "003bh1750"), "Lux")
        val waterTempItem = pickSensor(sensorMap, listOf("SNS-WT-005", "005sensorair", "SNS-WT-006"), "°C")
        val reservoirItem = pickSensor(sensorMap, listOf("SNS-WT-006"), "°C")

        var airTemp: Double? = null
        var airHum: Double? = null
        val ahtCombo = sensorMap["SNS-AHT-004"]
        if (ahtCombo != null) {
            airTemp = toDoubleOrNull(
                if (ahtCombo.has("temperature")) ahtCombo.get("temperature") else ahtCombo.get("value")
            )
            airHum = toDoubleOrNull(ahtCombo.get("humidity"))
        }
        if (airTemp == null) {
            airTemp = pickSensor(sensorMap, listOf("004aht20_temp"), "°C")?.first
        }
        if (airHum == null) {
            airHum = pickSensor(sensorMap, listOf("004aht20_hum"), "%")?.first
        }

        if (wifiItem == null && phItem == null && ecItem == null && lightItem == null &&
            waterTempItem == null && airTemp == null && airHum == null
        ) {
            return null
        }

        val sysObj = root.optObjectCompat("system_status")
        val pompa = sysObj?.optStringCompat("pompa", "")?.ifBlank { null }
            ?: root.optStringCompat("pompa", "").ifBlank { null }
        val deepSleep = sysObj?.let { toDoubleOrNull(it.get("deepsleep_sec"))?.toInt()?.takeIf { sec -> sec >= 0 } }

        val deviceId = root.optStringCompat("device_id", "").ifBlank {
            root.optStringCompat("clientId", "DEV-TSK-01")
        }
        val ts = root.optStringCompat("timestamp", "").ifBlank {
            root.optStringCompat("time", TimeRangeAggregator.nowIsoUtc())
        }

        return NormalizedTelemetry(
            deviceId = deviceId,
            timestamp = ts,
            wifiRssi = wifiItem?.first,
            ph = phItem?.first,
            ec = ecItem?.first,
            light = lightItem?.first,
            airTemp = airTemp,
            airHum = airHum,
            waterTemp = waterTempItem?.first,
            reservoirTemp = reservoirItem?.first,
            pompaStatus = pompa,
            deepSleepSec = deepSleep,
            wifiUnit = wifiItem?.second ?: "dBm",
            ecUnit = ecItem?.second ?: "mS/cm",
            lightUnit = lightItem?.second ?: "Lux"
        )
    }

    private fun pickSensor(
        map: Map<String, JsonObject>,
        ids: List<String>,
        defaultUnit: String
    ): Pair<Double, String>? {
        for (id in ids) {
            val item = map[id] ?: continue
            val value = toDoubleOrNull(item.get("value"))
            if (value != null) {
                val unit = item.optStringCompat("satuan", "").ifBlank { defaultUnit }
                return value to unit
            }
        }
        return null
    }

    private fun parseFlatPayload(root: JsonObject): NormalizedTelemetry? {
        fun getVal(keys: List<String>): Double? {
            for (k in keys) {
                if (root.has(k) && !root.get(k).isJsonNull) {
                    val d = toDoubleOrNull(root.get(k))
                    if (d != null) return d
                }
            }
            return null
        }

        val wifi = getVal(listOf("wifi", "wifi_rssi", "rssi", "kekuatan_wiFi", "signal", "wifi_speed"))
        val ph = getVal(listOf("ph", "pH", "PH", "ph_value", "001pH", "sensor_ph"))
        val ecRaw = getVal(listOf("ec", "EC", "ec_value", "002EC", "sensor_ec"))
        val tdsRaw = getVal(listOf("tds", "TDS", "ppm", "PPM"))
        val ec = ecRaw ?: tdsRaw?.let { if (it > 15.0) it / 640.0 else it }
        val light = getVal(listOf("light", "lux", "Lux", "bh1750", "cahaya", "003bh1750", "intensitas_cahaya"))
        val airTemp = getVal(listOf("air_temp", "airTemp", "temp", "temperature", "suhu_udara", "suhu", "004aht20_temp"))
        val airHum = getVal(listOf("hum", "humidity", "air_hum", "airHum", "kelembaban", "004aht20_hum"))
        val waterTempDirect = getVal(
            listOf("water_temp", "waterTemp", "temp_water", "suhu_air", "005sensorair", "tandon_temp", "water_temperature")
        )
        val hasAny = listOf(wifi, ph, ec, light, airTemp, airHum, waterTempDirect).any { it != null }
        if (!hasAny) return null

        val waterTemp = waterTempDirect ?: airTemp?.let { max(18.0, it - 1.5) }
        val deviceId = root.optStringCompat("device_id", "").ifBlank {
            root.optStringCompat("clientId", "MQTTX")
        }
        val ts = root.optStringCompat("timestamp", "").ifBlank {
            root.optStringCompat("time", TimeRangeAggregator.nowIsoUtc())
        }
        val sysObj = root.optObjectCompat("system_status")
        val pompa = sysObj?.optStringCompat("pompa", "")?.ifBlank { null }
            ?: root.optStringCompat("pompa", "Standby")

        return NormalizedTelemetry(
            deviceId = deviceId,
            timestamp = ts,
            wifiRssi = wifi,
            ph = ph,
            ec = ec,
            light = light,
            airTemp = airTemp,
            airHum = airHum,
            waterTemp = waterTemp,
            reservoirTemp = null,
            pompaStatus = pompa
        )
    }

    fun parseDeviceStatus(rawJson: String): DeviceStatusPayload? {
        return try {
            val parsed = JsonParser.parseString(rawJson)
            if (!parsed.isJsonObject) return null
            val root = parsed.asJsonObject
            val pumpsObj = root.optObjectCompat("pumps_status")
            val hasStatusMsg = root.has("status_message")
            if (pumpsObj == null && !hasStatusMsg) return null

            val pumpMap = LinkedHashMap<String, String>()
            if (pumpsObj != null) {
                for ((k, v) in pumpsObj.entrySet()) {
                    val str = if (v.isJsonNull || !v.isJsonPrimitive) "OFF" else v.asString
                    pumpMap[k] = str.uppercase(Locale.US)
                }
            }

            val interval = toDoubleOrNull(root.get("active_interval_minutes"))?.toInt()?.takeIf { it > 0 }

            DeviceStatusPayload(
                deviceId = root.optStringCompat("device_id", "DEV-TSK-01"),
                statusMessage = root.optStringCompat("status_message", "Terhubung"),
                activeIntervalMinutes = interval,
                pumpsStatus = pumpMap,
                timestamp = root.optStringCompat("timestamp", "").ifBlank { null }
            )
        } catch (_: Exception) {
            null
        }
    }
}

object NotificationBuilder {
    fun buildSensorNotificationItem(
        phVal: Double?,
        ecVal: Double?,
        wtVal: Double?,
        humVal: Double?,
        thr: ParsedThresholds,
        timeText: String,
        forceWarn: Boolean
    ): SensorNotification {
        val issues = mutableListOf<String>()
        val details = mutableListOf<String>()
        if (phVal != null && (phVal < thr.phMin || phVal > thr.phMax)) {
            issues.add("pH")
            details.add(String.format(Locale.US, "pH %.2f (batas %.1f–%.1f)", phVal, thr.phMin, thr.phMax))
        }
        if (ecVal != null && (ecVal < thr.ecMin || ecVal > thr.ecMax)) {
            issues.add("EC")
            details.add(String.format(Locale.US, "EC %.2f mS/cm (batas %.1f–%.1f)", ecVal, thr.ecMin, thr.ecMax))
        }
        if (wtVal != null && (wtVal < thr.tempMin || wtVal > thr.tempMax)) {
            issues.add("Suhu Air")
            details.add(String.format(Locale.US, "Suhu air %.1f°C (batas %.0f–%.0f°C)", wtVal, thr.tempMin, thr.tempMax))
        }
        if (humVal != null && (humVal < thr.humMin || humVal > thr.humMax)) {
            issues.add("Kelembapan")
            details.add(String.format(Locale.US, "Kelembapan %.1f%% (batas %.0f–%.0f%%)", humVal, thr.humMin, thr.humMax))
        }

        val parts = mutableListOf<String>()
        if (phVal != null) parts.add(String.format(Locale.US, "pH: %.2f", phVal))
        if (ecVal != null) parts.add(String.format(Locale.US, "EC: %.2f mS/cm", ecVal))
        if (wtVal != null) parts.add(String.format(Locale.US, "Air: %.1f°C", wtVal))
        if (humVal != null) parts.add(String.format(Locale.US, "RH: %.1f%%", humVal))
        val valSummary = if (parts.isNotEmpty()) parts.joinToString(" · ") else "N/A"

        return if (issues.isNotEmpty() || forceWarn) {
            SensorNotification(
                type = "warning",
                tag = "PERINGATAN",
                time = timeText,
                title = if (issues.isNotEmpty()) {
                    "Peringatan: ${issues.joinToString(" & ")} di luar batas aman"
                } else {
                    "Peringatan Parameter Sensor"
                },
                desc = if (details.isNotEmpty()) {
                    details.joinToString(" · ")
                } else {
                    "Salah satu pembacaan sensor melewati ambang batas yang ditentukan."
                },
                value = valSummary
            )
        } else {
            SensorNotification(
                type = "normal",
                tag = "NORMAL",
                time = timeText,
                title = "Kondisi Sensor Normal",
                desc = "Semua parameter berada dalam batas ambang aman.",
                value = valSummary
            )
        }
    }
}
