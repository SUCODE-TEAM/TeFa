package id.tefa.smartgreenhouse.network

import android.util.Log
import id.tefa.smartgreenhouse.model.AwsHistoryRow
import id.tefa.smartgreenhouse.model.NormalizedTelemetry
import id.tefa.smartgreenhouse.model.NotificationBuilder
import id.tefa.smartgreenhouse.model.ParsedThresholds
import id.tefa.smartgreenhouse.model.PayloadNormalizer
import id.tefa.smartgreenhouse.model.SensorHistoryRow
import id.tefa.smartgreenhouse.model.SensorNotification
import id.tefa.smartgreenhouse.model.TelemetryLogPoint
import id.tefa.smartgreenhouse.model.TimeRangeAggregator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class SupabaseHistoryBundle(
    val sensorHistoryRows: List<SensorHistoryRow>,
    val notifications: List<SensorNotification>,
    val telemetryLog: List<TelemetryLogPoint>,
    val awsDailyRows: List<AwsHistoryRow>,
    val awsWeeklyRows: List<AwsHistoryRow>,
    val awsMonthlyRows: List<AwsHistoryRow>
)

object SupabaseClient {
    private const val TAG = "TeFaSupabase"
    private const val BASE_URL = "https://nrlktavercurgxwgpcfa.supabase.co/rest/v1"
    private const val ANON_KEY = "sb_publishable_P7p6_aBUXNlZ_d-O2G2UGQ_sm2jX9cF"
    private const val SENSOR_TABLE = "DataSensor"
    private const val AWS_TABLE = "DataAWS"

    suspend fun fetchHistory(thresholds: ParsedThresholds): SupabaseHistoryBundle? =
        withContext(Dispatchers.IO) {
            val sensorArr = fetchRows(SENSOR_TABLE, 1000)
            val awsArr = fetchRows(AWS_TABLE, 500)
            if (sensorArr == null && awsArr == null) return@withContext null

            val sensorHistoryRows = mutableListOf<SensorHistoryRow>()
            val notifications = mutableListOf<SensorNotification>()
            val telemetryLog = mutableListOf<TelemetryLogPoint>()

            if (sensorArr != null) {
                for (i in 0 until sensorArr.length()) {
                    val r = sensorArr.optJSONObject(i) ?: continue
                    val waktu = r.optString("waktu", "")
                    val phVal = PayloadNormalizer.toDoubleOrNull(r.opt("PH"))
                    val ppmVal = PayloadNormalizer.toDoubleOrNull(r.opt("PPM"))
                    val wtVal = PayloadNormalizer.toDoubleOrNull(r.opt("Suhu_air"))
                    val lxVal = PayloadNormalizer.toDoubleOrNull(r.opt("cahaya"))
                    val humVal = PayloadNormalizer.toDoubleOrNull(r.opt("kelembapan"))

                    val hasBoolStatus = r.has("status") && r.opt("status") is Boolean
                    val isWarn = if (hasBoolStatus) {
                        !r.optBoolean("status", true)
                    } else {
                        (phVal != null && (phVal < thresholds.phMin || phVal > thresholds.phMax)) ||
                            (wtVal != null && (wtVal < thresholds.tempMin || wtVal > thresholds.tempMax)) ||
                            (humVal != null && (humVal < thresholds.humMin || humVal > thresholds.humMax))
                    }

                    val displayTime = TimeRangeAggregator.formatDisplayTimeWithDate(waktu)
                    sensorHistoryRows.add(
                        SensorHistoryRow(
                            time = displayTime,
                            ph = phVal?.let { String.format(Locale.US, "%.2f", it) } ?: "N/A",
                            ppm = ppmVal?.let { String.format(Locale.US, "%.2f mS/cm", it) } ?: "N/A",
                            temp = wtVal?.let { String.format(Locale.US, "%.1f", it) } ?: "N/A",
                            light = lxVal?.let { String.format(Locale.US, "%.1f", it) } ?: "N/A",
                            hum = humVal?.let { String.format(Locale.US, "%.1f%%", it) } ?: "N/A",
                            status = if (isWarn) "Warning" else "Normal"
                        )
                    )

                    if (i < 50) {
                        val rowWarn = if (hasBoolStatus) !r.optBoolean("status", true) else isWarn
                        notifications.add(
                            NotificationBuilder.buildSensorNotificationItem(
                                phVal = phVal,
                                ecVal = ppmVal,
                                wtVal = wtVal,
                                humVal = humVal,
                                thr = thresholds,
                                timeText = "$displayTime WIB",
                                forceWarn = rowWarn
                            )
                        )
                    }

                    val ts = TimeRangeAggregator.parseIsoTimestampMillis(waktu) ?: System.currentTimeMillis()
                    telemetryLog.add(
                        TelemetryLogPoint(
                            ts = ts,
                            time = TimeRangeAggregator.formatWibTime(waktu),
                            ph = phVal ?: 0.0,
                            ec = ppmVal ?: 0.0,
                            waterTemp = wtVal ?: 0.0,
                            airTemp = 0.0,
                            airHum = null,
                            light = lxVal ?: 0.0
                        )
                    )
                }
            }

            telemetryLog.sortBy { it.ts }

            val awsDaily = mutableListOf<AwsHistoryRow>()
            var awsWeekly = emptyList<AwsHistoryRow>()
            var awsMonthly = emptyList<AwsHistoryRow>()

            if (awsArr != null && awsArr.length() > 0) {
                val now = System.currentTimeMillis()
                val wibTz = TimeZone.getTimeZone("Asia/Jakarta")
                val points = mutableListOf<AwsPoint>()

                for (i in 0 until awsArr.length()) {
                    val r = awsArr.optJSONObject(i) ?: continue
                    val waktu = r.optString("waktu", "")
                    val ts = TimeRangeAggregator.parseIsoTimestampMillis(waktu) ?: now
                    val rad = PayloadNormalizer.toDoubleOrNull(r.opt("radiasi"))
                    val temp = PayloadNormalizer.toDoubleOrNull(r.opt("temperatur"))
                    val hum = PayloadNormalizer.toDoubleOrNull(r.opt("kelembapan"))
                    points.add(
                        AwsPoint(
                            ts = ts,
                            time = TimeRangeAggregator.formatDisplayTimeWithDate(waktu),
                            airTemp = temp,
                            airHum = hum,
                            light = rad?.let { it / 0.0079 },
                            radiasi = rad
                        )
                    )
                }

                points.filter { now - it.ts <= 24L * 3600L * 1000L }
                    .take(200)
                    .forEach { pt ->
                        val solarTxt = if (pt.radiasi != null) {
                            String.format(
                                Locale.US,
                                "%.1f W/m² · %.0f PAR",
                                pt.radiasi,
                                (pt.radiasi / 0.0079) * 0.0185
                            )
                        } else "-"
                        awsDaily.add(
                            AwsHistoryRow(
                                time = "${pt.time} WIB",
                                temp = pt.airTemp?.let { String.format(Locale.US, "%.1f °C", it) } ?: "-",
                                hum = pt.airHum?.let { String.format(Locale.US, "%.1f%%", it) } ?: "-",
                                solar = solarTxt
                            )
                        )
                    }

                val weekWindow = points.filter { now - it.ts <= 7L * 24L * 3600L * 1000L }
                awsWeekly = buildGroupedAwsRows(
                    weekWindow,
                    keyFn = { pt ->
                        val c = Calendar.getInstance(wibTz, Locale.US).apply { timeInMillis = pt.ts }
                        String.format(
                            Locale.US,
                            "%04d-%02d-%02d",
                            c.get(Calendar.YEAR),
                            c.get(Calendar.MONTH) + 1,
                            c.get(Calendar.DAY_OF_MONTH)
                        )
                    },
                    labelFn = { pt ->
                        val c = Calendar.getInstance(wibTz, Locale.US).apply { timeInMillis = pt.ts }
                        String.format(
                            Locale.US,
                            "%02d %s %04d",
                            c.get(Calendar.DAY_OF_MONTH),
                            TimeRangeAggregator.monthsShort[c.get(Calendar.MONTH)],
                            c.get(Calendar.YEAR)
                        )
                    }
                )

                val monthWindow = points.filter { now - it.ts <= 30L * 24L * 3600L * 1000L }
                fun getWeekStart(ts: Long): Calendar {
                    val c = Calendar.getInstance(wibTz, Locale.US).apply { timeInMillis = ts }
                    val day = c.get(Calendar.DAY_OF_WEEK)
                    val offset = if (day == Calendar.SUNDAY) -6 else (Calendar.MONDAY - day)
                    c.add(Calendar.DAY_OF_MONTH, offset)
                    return c
                }
                awsMonthly = buildGroupedAwsRows(
                    monthWindow,
                    keyFn = { pt ->
                        val ws = getWeekStart(pt.ts)
                        String.format(
                            Locale.US,
                            "%04d-%02d-%02d",
                            ws.get(Calendar.YEAR),
                            ws.get(Calendar.MONTH) + 1,
                            ws.get(Calendar.DAY_OF_MONTH)
                        )
                    },
                    labelFn = { pt ->
                        val ws = getWeekStart(pt.ts)
                        val we = (ws.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 6) }
                        if (ws.get(Calendar.MONTH) == we.get(Calendar.MONTH)) {
                            String.format(
                                Locale.US,
                                "%02d - %02d %s %04d",
                                ws.get(Calendar.DAY_OF_MONTH),
                                we.get(Calendar.DAY_OF_MONTH),
                                TimeRangeAggregator.monthsShort[we.get(Calendar.MONTH)],
                                we.get(Calendar.YEAR)
                            )
                        } else {
                            String.format(
                                Locale.US,
                                "%02d %s - %02d %s %04d",
                                ws.get(Calendar.DAY_OF_MONTH),
                                TimeRangeAggregator.monthsShort[ws.get(Calendar.MONTH)],
                                we.get(Calendar.DAY_OF_MONTH),
                                TimeRangeAggregator.monthsShort[we.get(Calendar.MONTH)],
                                we.get(Calendar.YEAR)
                            )
                        }
                    }
                )
            }

            SupabaseHistoryBundle(
                sensorHistoryRows = sensorHistoryRows.take(200),
                notifications = notifications.take(50),
                telemetryLog = telemetryLog.takeLast(2000),
                awsDailyRows = awsDaily,
                awsWeeklyRows = awsWeekly,
                awsMonthlyRows = awsMonthly
            )
        }

    suspend fun saveTelemetry(payload: NormalizedTelemetry, thresholds: ParsedThresholds) =
        withContext(Dispatchers.IO) {
            val tsMillis = TimeRangeAggregator.parseIsoTimestampMillis(payload.timestamp)
            val isoTime = if (tsMillis != null) payload.timestamp else TimeRangeAggregator.nowIsoUtc()

            if (payload.ph != null || payload.ec != null || payload.waterTemp != null ||
                payload.light != null || payload.airHum != null
            ) {
                val isWarn = (payload.ph != null && (payload.ph < thresholds.phMin || payload.ph > thresholds.phMax)) ||
                    (payload.waterTemp != null && (payload.waterTemp < thresholds.tempMin || payload.waterTemp > thresholds.tempMax)) ||
                    (payload.airHum != null && (payload.airHum < thresholds.humMin || payload.airHum > thresholds.humMax))

                val row = JSONObject().apply {
                    put("waktu", isoTime)
                    put("PH", payload.ph?.let { String.format(Locale.US, "%.2f", it).toDouble() } ?: JSONObject.NULL)
                    put("PPM", payload.ec?.let { String.format(Locale.US, "%.2f", it).toDouble() } ?: JSONObject.NULL)
                    put("Suhu_air", payload.waterTemp?.let { String.format(Locale.US, "%.1f", it).toDouble() } ?: JSONObject.NULL)
                    put(
                        "cahaya",
                        payload.light?.let { max(-32768, min(32767, it.roundToInt())) } ?: JSONObject.NULL
                    )
                    put("kelembapan", payload.airHum?.let { String.format(Locale.US, "%.1f", it).toDouble() } ?: JSONObject.NULL)
                    put("status", !isWarn)
                }
                postRow(SENSOR_TABLE, row)
            }

            if (payload.airTemp != null || payload.airHum != null || payload.light != null) {
                val row = JSONObject().apply {
                    put("waktu", isoTime)
                    put("temperatur", payload.airTemp?.let { String.format(Locale.US, "%.1f", it).toDouble() } ?: JSONObject.NULL)
                    put("kelembapan", payload.airHum?.let { String.format(Locale.US, "%.1f", it).toDouble() } ?: JSONObject.NULL)
                    put("radiasi", payload.light?.let { String.format(Locale.US, "%.2f", it * 0.0079).toDouble() } ?: JSONObject.NULL)
                }
                postRow(AWS_TABLE, row)
            }
        }

    private fun fetchRows(table: String, limit: Int): JSONArray? {
        return try {
            val url = URL("$BASE_URL/$table?select=*&order=waktu.desc&limit=$limit")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 10_000
                readTimeout = 12_000
                setRequestProperty("apikey", ANON_KEY)
            }
            val code = conn.responseCode
            if (code in 200..299) {
                val body = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
                conn.disconnect()
                JSONArray(body)
            } else {
                Log.w(TAG, "Gagal muat $table HTTP $code")
                conn.disconnect()
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error muat $table: ${e.message}")
            null
        }
    }

    private fun postRow(table: String, row: JSONObject) {
        try {
            val url = URL("$BASE_URL/$table")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("apikey", ANON_KEY)
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Prefer", "return=minimal")
            }
            conn.outputStream.use { os ->
                os.write(row.toString().toByteArray(Charsets.UTF_8))
                os.flush()
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                Log.w(TAG, "Gagal simpan ke $table HTTP $code")
            }
            conn.disconnect()
        } catch (e: Exception) {
            Log.w(TAG, "Error simpan ke $table: ${e.message}")
        }
    }

    private data class AwsPoint(
        val ts: Long,
        val time: String,
        val airTemp: Double?,
        val airHum: Double?,
        val light: Double?,
        val radiasi: Double?
    )

    private data class GroupBucket(
        val label: String,
        val items: MutableList<AwsPoint> = mutableListOf(),
        var maxTs: Long = 0L
    )

    private fun buildGroupedAwsRows(
        entries: List<AwsPoint>,
        keyFn: (AwsPoint) -> String,
        labelFn: (AwsPoint) -> String
    ): List<AwsHistoryRow> {
        val map = LinkedHashMap<String, GroupBucket>()
        for (pt in entries) {
            val k = keyFn(pt)
            val bucket = map[k] ?: GroupBucket(label = labelFn(pt), maxTs = pt.ts).also { map[k] = it }
            bucket.items.add(pt)
            if (pt.ts > bucket.maxTs) bucket.maxTs = pt.ts
        }
        return map.values.sortedByDescending { it.maxTs }.map { g ->
            var tempSum = 0.0
            var tempCnt = 0
            var humSum = 0.0
            var humCnt = 0
            var lightSum = 0.0
            var lightCnt = 0
            for (it in g.items) {
                if (it.airTemp != null && it.airTemp > 0) {
                    tempSum += it.airTemp
                    tempCnt++
                }
                if (it.airHum != null) {
                    humSum += it.airHum
                    humCnt++
                }
                if (it.light != null) {
                    lightSum += it.light
                    lightCnt++
                }
            }
            val avgLight = if (lightCnt > 0) lightSum / lightCnt else null
            AwsHistoryRow(
                time = "${g.label} · Rata-rata (${g.items.size} data)",
                temp = if (tempCnt > 0) String.format(Locale.US, "%.1f °C", tempSum / tempCnt) else "-",
                hum = if (humCnt > 0) String.format(Locale.US, "%.1f%%", humSum / humCnt) else "-",
                solar = avgLight?.let {
                    String.format(Locale.US, "%.1f W/m² · %.0f PAR", it * 0.0079, it * 0.0185)
                } ?: "-"
            )
        }
    }

    fun buildAwsAggregationsFromTelemetryLog(telemetryLog: List<TelemetryLogPoint>): Triple<List<AwsHistoryRow>, List<AwsHistoryRow>, List<AwsHistoryRow>> {
        val now = System.currentTimeMillis()
        val wibTz = TimeZone.getTimeZone("Asia/Jakarta")
        val points = telemetryLog.map {
            AwsPoint(
                ts = it.ts,
                time = it.time.ifBlank { "--:--:--" },
                airTemp = if (it.airTemp > 0) it.airTemp else null,
                airHum = it.airHum,
                light = it.light,
                radiasi = it.light * 0.0079
            )
        }
        val daily = points.filter { now - it.ts <= 24L * 3600L * 1000L }
            .takeLast(200)
            .reversed()
            .map { pt ->
                AwsHistoryRow(
                    time = "${pt.time} WIB",
                    temp = pt.airTemp?.let { String.format(Locale.US, "%.1f °C", it) } ?: "-",
                    hum = pt.airHum?.let { String.format(Locale.US, "%.1f%%", it) } ?: "-",
                    solar = pt.light?.let {
                        String.format(Locale.US, "%.1f W/m² · %.0f PAR", it * 0.0079, it * 0.0185)
                    } ?: "-"
                )
            }

        val weekWindow = points.filter { now - it.ts <= 7L * 24L * 3600L * 1000L }
        val weekly = buildGroupedAwsRows(
            weekWindow,
            keyFn = { pt ->
                val c = Calendar.getInstance(wibTz, Locale.US).apply { timeInMillis = pt.ts }
                String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
            },
            labelFn = { pt ->
                val c = Calendar.getInstance(wibTz, Locale.US).apply { timeInMillis = pt.ts }
                String.format(Locale.US, "%02d %s %04d", c.get(Calendar.DAY_OF_MONTH), TimeRangeAggregator.monthsShort[c.get(Calendar.MONTH)], c.get(Calendar.YEAR))
            }
        )

        val monthWindow = points.filter { now - it.ts <= 30L * 24L * 3600L * 1000L }
        fun getWeekStart(ts: Long): Calendar {
            val c = Calendar.getInstance(wibTz, Locale.US).apply { timeInMillis = ts }
            val day = c.get(Calendar.DAY_OF_WEEK)
            val offset = if (day == Calendar.SUNDAY) -6 else (Calendar.MONDAY - day)
            c.add(Calendar.DAY_OF_MONTH, offset)
            return c
        }
        val monthly = buildGroupedAwsRows(
            monthWindow,
            keyFn = { pt ->
                val ws = getWeekStart(pt.ts)
                String.format(Locale.US, "%04d-%02d-%02d", ws.get(Calendar.YEAR), ws.get(Calendar.MONTH) + 1, ws.get(Calendar.DAY_OF_MONTH))
            },
            labelFn = { pt ->
                val ws = getWeekStart(pt.ts)
                val we = (ws.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 6) }
                if (ws.get(Calendar.MONTH) == we.get(Calendar.MONTH)) {
                    String.format(Locale.US, "%02d - %02d %s %04d", ws.get(Calendar.DAY_OF_MONTH), we.get(Calendar.DAY_OF_MONTH), TimeRangeAggregator.monthsShort[we.get(Calendar.MONTH)], we.get(Calendar.YEAR))
                } else {
                    String.format(Locale.US, "%02d %s - %02d %s %04d", ws.get(Calendar.DAY_OF_MONTH), TimeRangeAggregator.monthsShort[ws.get(Calendar.MONTH)], we.get(Calendar.DAY_OF_MONTH), TimeRangeAggregator.monthsShort[we.get(Calendar.MONTH)], we.get(Calendar.YEAR))
                }
            }
        )
        return Triple(daily, weekly, monthly)
    }
}
