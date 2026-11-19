package id.tefa.smartgreenhouse

import id.tefa.smartgreenhouse.model.DashboardSettings
import id.tefa.smartgreenhouse.model.NotificationBuilder
import id.tefa.smartgreenhouse.model.PayloadNormalizer
import id.tefa.smartgreenhouse.model.TelemetryLogPoint
import id.tefa.smartgreenhouse.model.TimeRangeAggregator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PayloadNormalizerTest {

    @Test
    fun parseStandardSensorsArrayPayload() {
        val json = """
            {
              "device_id": "DEV-TSK-01",
              "timestamp": "2026-11-09T04:15:30Z",
              "sensors": [
                {"id": "SNS-PH-001", "name": "pH Larutan Nutrisi", "value": 7.20, "satuan": "pH"},
                {"id": "SNS-EC-002", "name": "Konduktivitas Listrik (EC)", "value": 1.45, "satuan": "mS/cm"},
                {"id": "SNS-BH-003", "name": "Intensitas Cahaya", "value": 450.50, "satuan": "Lux"},
                {"id": "SNS-AHT-004", "name": "Suhu & Kelembapan Udara", "temperature": 28.50, "humidity": 65.20},
                {"id": "SNS-WT-005", "name": "Suhu Air", "value": 26.80, "satuan": "°C"},
                {"id": "TEL-WIFI-001", "name": "RSSI", "value": -65, "satuan": "dBm"}
              ]
            }
        """.trimIndent()

        val res = PayloadNormalizer.normalizePayload(json)
        assertNotNull(res)
        assertEquals("DEV-TSK-01", res!!.deviceId)
        assertEquals(7.20, res.ph!!, 0.001)
        assertEquals(1.45, res.ec!!, 0.001)
        assertEquals(450.50, res.light!!, 0.001)
        assertEquals(28.50, res.airTemp!!, 0.001)
        assertEquals(65.20, res.airHum!!, 0.001)
        assertEquals(26.80, res.waterTemp!!, 0.001)
        assertEquals(-65.0, res.wifiRssi!!, 0.001)
    }

    @Test
    fun parseFlatMqttxPayload() {
        val json = """{"ph":6.85,"ec":1.48,"temp":28.2,"hum":68.5,"water_temp":25.4,"light":550,"wifi":-58}"""
        val res = PayloadNormalizer.normalizePayload(json)
        assertNotNull(res)
        assertEquals(6.85, res!!.ph!!, 0.001)
        assertEquals(1.48, res.ec!!, 0.001)
        assertEquals(28.2, res.airTemp!!, 0.001)
        assertEquals(68.5, res.airHum!!, 0.001)
        assertEquals(25.4, res.waterTemp!!, 0.001)
        assertEquals(550.0, res.light!!, 0.001)
        assertEquals(-58.0, res.wifiRssi!!, 0.001)
    }

    @Test
    fun parseDeviceStatusPayload() {
        val json = """
            {
              "device_id": "DEV-TSK-01",
              "status_message": "Command executed successfully",
              "active_interval_minutes": 1,
              "pumps_status": {
                "pump_A": "OFF",
                "pump_B": "OFF",
                "pump_up": "OFF",
                "pump_down": "OFF",
                "pump_big": "ON"
              }
            }
        """.trimIndent()
        val status = PayloadNormalizer.parseDeviceStatus(json)
        assertNotNull(status)
        assertEquals("DEV-TSK-01", status!!.deviceId)
        assertEquals(1, status.activeIntervalMinutes)
        assertEquals("ON", status.pumpsStatus["pump_big"])
        assertNull(PayloadNormalizer.parseDeviceStatus("""{"foo":"bar"}"""))
    }

    @Test
    fun timeRangeAggregatorBuckets() {
        val base = 1762661732000L
        val log = listOf(
            TelemetryLogPoint(base, "11:15:32", 6.2, 1.4, 25.0, 28.0, 65.0, 400.0),
            TelemetryLogPoint(base + 4_000L, "11:15:36", 6.4, 1.5, 25.2, 28.4, 64.0, 450.0)
        )
        val res1J = TimeRangeAggregator.getSeriesForRange(log, "1J")
        assertEquals(2, res1J.points.size)
        val res24J = TimeRangeAggregator.getSeriesForRange(log, "24J")
        assertEquals(1, res24J.points.size)
        assertEquals(6.3, res24J.points[0].ph, 0.01)
    }

    @Test
    fun ecOutOfRangeTriggersWarningNotification() {
        val thr = DashboardSettings().parsedThresholds()
        assertEquals(1.0, thr.ecMin, 0.001)
        assertEquals(2.5, thr.ecMax, 0.001)

        val notif = NotificationBuilder.buildSensorNotificationItem(
            phVal = 6.0,
            ecVal = 3.10,
            wtVal = 25.0,
            humVal = 65.0,
            thr = thr,
            timeText = "09:15:00 WIB",
            forceWarn = false
        )
        assertEquals("warning", notif.type)
        assertTrue(notif.title.contains("EC"))
        assertTrue(notif.desc.contains("EC 3.10 mS/cm"))
        assertTrue(notif.value.contains("EC: 3.10 mS/cm"))
    }
}
