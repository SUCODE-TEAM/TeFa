package id.tefa.smartgreenhouse.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import id.tefa.smartgreenhouse.model.AuthSession
import id.tefa.smartgreenhouse.model.ControlPayload
import id.tefa.smartgreenhouse.model.DashboardSettings
import id.tefa.smartgreenhouse.model.TelemetryLogPoint
import id.tefa.smartgreenhouse.model.ThresholdPayload
import id.tefa.smartgreenhouse.model.TimeRangeAggregator

object SessionStore {
    @Volatile
    var currentSession: AuthSession = AuthSession(
        username = "Viewer",
        role = "viewer",
        loginTime = TimeRangeAggregator.nowIsoUtc()
    )

    fun isAdmin(): Boolean = currentSession.role.equals("admin", ignoreCase = true)

    fun loginAsAdmin(username: String) {
        currentSession = AuthSession(
            username = username,
            role = "admin",
            loginTime = TimeRangeAggregator.nowIsoUtc()
        )
    }

    fun switchToViewer(username: String = "Viewer") {
        currentSession = AuthSession(
            username = username,
            role = "viewer",
            loginTime = TimeRangeAggregator.nowIsoUtc()
        )
    }
}

class PreferencesManager(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    fun getSettings(): DashboardSettings {
        val raw = prefs.getString(KEY_SETTINGS, null) ?: return DashboardSettings()
        return try {
            val parsed = gson.fromJson(raw, DashboardSettings::class.java) ?: DashboardSettings()
            val fixedPub = if (parsed.mqttTopicPub == "tefa/hidroponik/aktuator" || parsed.mqttTopicPub.isBlank()) {
                DashboardSettings.DEFAULT_TOPIC_CONTROL
            } else {
                parsed.mqttTopicPub
            }
            parsed.copy(
                mqttBroker = parsed.mqttBroker.ifBlank { DashboardSettings.DEFAULT_BROKER_URL },
                mqttTopicSub = parsed.mqttTopicSub.ifBlank { DashboardSettings.DEFAULT_TOPIC_SENSOR },
                mqttTopicPub = fixedPub,
                mqttTopicStatus = parsed.mqttTopicStatus.ifBlank { DashboardSettings.DEFAULT_TOPIC_STATUS }
            )
        } catch (_: Exception) {
            DashboardSettings()
        }
    }

    fun saveSettings(settings: DashboardSettings) {
        prefs.edit().putString(KEY_SETTINGS, gson.toJson(settings)).apply()
    }

    fun resetSettings(): DashboardSettings {
        prefs.edit().remove(KEY_SETTINGS).apply()
        return DashboardSettings()
    }

    fun getTelemetryLog(): MutableList<TelemetryLogPoint> {
        val raw = prefs.getString(KEY_TELEMETRY_LOG, null) ?: return mutableListOf()
        return try {
            val type = object : TypeToken<List<TelemetryLogPoint>>() {}.type
            val list: List<TelemetryLogPoint> = gson.fromJson(raw, type) ?: emptyList()
            val cutoff = System.currentTimeMillis() - 30L * 24L * 3600L * 1000L
            list.filter { it.ts >= cutoff }.takeLast(2000).toMutableList()
        } catch (_: Exception) {
            mutableListOf()
        }
    }

    fun saveTelemetryLog(log: List<TelemetryLogPoint>) {
        try {
            val trimmed = log.takeLast(2000)
            prefs.edit().putString(KEY_TELEMETRY_LOG, gson.toJson(trimmed)).apply()
        } catch (_: Exception) {
        }
    }

    fun getRememberedUsername(): String? {
        return prefs.getString(KEY_REMEMBERED_USERNAME, null)?.takeIf { it.isNotBlank() }
    }

    fun saveRememberedUsername(username: String?) {
        if (username.isNullOrBlank()) {
            prefs.edit().remove(KEY_REMEMBERED_USERNAME).apply()
        } else {
            prefs.edit().putString(KEY_REMEMBERED_USERNAME, username).apply()
        }
    }

    fun buildControlPayload(settings: DashboardSettings = getSettings()): ControlPayload {
        val ecParsed = settings.ecTarget.replace(",", ".").toDoubleOrNull() ?: 1.5
        val phMinParsed = settings.phMin.replace(",", ".").toDoubleOrNull() ?: 5.5
        val phMaxParsed = settings.phMax.replace(",", ".").toDoubleOrNull() ?: 6.5
        val upDoseParsed = settings.phUpDose.replace(",", ".").toDoubleOrNull() ?: 0.0
        val downDoseParsed = settings.phDownDose.replace(",", ".").toDoubleOrNull() ?: 0.0
        val intervalParsed = settings.intervalMinutes.toIntOrNull()?.takeIf { it > 0 } ?: 1

        val pumps = linkedMapOf(
            "pump_A" to settings.pump_A.lowercase(),
            "pump_B" to settings.pump_B.lowercase(),
            "pump_up" to settings.pump_up.lowercase(),
            "pump_down" to settings.pump_down.lowercase(),
            "pump_big" to settings.pump_big.lowercase()
        )
        return ControlPayload(
            interval_minutes = intervalParsed,
            pumps = pumps,
            threshold = ThresholdPayload(
                ph_min = phMinParsed,
                ph_max = phMaxParsed,
                ec_target = ecParsed,
                ph_up_dose_sec = upDoseParsed,
                ph_down_dose_sec = downDoseParsed
            )
        )
    }

    fun buildControlPayloadJson(settings: DashboardSettings = getSettings()): String {
        return gson.toJson(buildControlPayload(settings))
    }

    companion object {
        private const val PREFS_NAME = "tefa_smart_greenhouse_prefs"
        private const val KEY_SETTINGS = "tefa_dashboard_settings"
        private const val KEY_TELEMETRY_LOG = "tefa_telemetry_log_v1"
        private const val KEY_REMEMBERED_USERNAME = "tefa_saved_username"
    }
}
