package id.tefa.smartgreenhouse.ui.dialog

import android.app.Dialog
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.ImageButton
import android.widget.Spinner
import com.google.android.material.button.MaterialButton
import id.tefa.smartgreenhouse.R
import id.tefa.smartgreenhouse.data.PreferencesManager
import id.tefa.smartgreenhouse.model.DashboardSettings

class SettingsDialog(
    private val context: Context,
    private val prefs: PreferencesManager,
    private val isAdmin: Boolean,
    private val onSave: (DashboardSettings) -> String,
    private val onReset: (DashboardSettings) -> Unit
) {
    private val providerKeys = listOf("gemini", "groq", "qwen", "openai", "deepseek", "openrouter")
    private val providerLabels = listOf(
        "Gemini (Google)",
        "Groq (Llama)",
        "Qwen (Alibaba)",
        "OpenAI (GPT)",
        "DeepSeek",
        "OpenRouter"
    )
    private val placeholders = mapOf(
        "gemini" to "Masukkan Gemini API Key (AIza...)...",
        "groq" to "Masukkan Groq API Key (gsk_...)...",
        "qwen" to "Masukkan Qwen / DashScope API Key (sk-...)...",
        "openai" to "Masukkan OpenAI API Key (sk-...)...",
        "deepseek" to "Masukkan DeepSeek API Key (sk-...)...",
        "openrouter" to "Masukkan OpenRouter API Key (sk-or-...)..."
    )

    fun show() {
        val dialog = Dialog(context)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val view = LayoutInflater.from(context).inflate(R.layout.dialog_settings, null)
        dialog.setContentView(view)
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(
                (context.resources.displayMetrics.widthPixels * 0.94).toInt(),
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val etPhMin = view.findViewById<EditText>(R.id.set_ph_min)
        val etPhMax = view.findViewById<EditText>(R.id.set_ph_max)
        val etEcMin = view.findViewById<EditText>(R.id.set_ec_min)
        val etEcMax = view.findViewById<EditText>(R.id.set_ec_max)
        val etTempMin = view.findViewById<EditText>(R.id.set_temp_min)
        val etTempMax = view.findViewById<EditText>(R.id.set_temp_max)
        val etHumMin = view.findViewById<EditText>(R.id.set_hum_min)
        val etHumMax = view.findViewById<EditText>(R.id.set_hum_max)

        val adminSection = view.findViewById<View>(R.id.adminMqttDosingSection)
        adminSection.visibility = if (isAdmin) View.VISIBLE else View.GONE

        val etBroker = view.findViewById<EditText>(R.id.set_mqtt_broker)
        val etTopicSub = view.findViewById<EditText>(R.id.set_mqtt_topic_sub)
        val etTopicPub = view.findViewById<EditText>(R.id.set_mqtt_topic_pub)
        val etTopicStatus = view.findViewById<EditText>(R.id.set_mqtt_topic_status)
        val etIntervalMin = view.findViewById<EditText>(R.id.set_interval_minutes)
        val etEcTarget = view.findViewById<EditText>(R.id.set_ec_target)
        val etPhUp = view.findViewById<EditText>(R.id.set_ph_up_dose)
        val etPhDown = view.findViewById<EditText>(R.id.set_ph_down_dose)

        val spProvider = view.findViewById<Spinner>(R.id.set_ai_provider)
        val etApiKey = view.findViewById<EditText>(R.id.set_ai_api_key)
        val btnReset = view.findViewById<MaterialButton>(R.id.setBtnReset)
        val btnSave = view.findViewById<MaterialButton>(R.id.setBtnSave)

        view.findViewById<ImageButton>(R.id.settingBtnClose).setOnClickListener { dialog.dismiss() }

        val adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, providerLabels).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        spProvider.adapter = adapter

        fun populateFields(s: DashboardSettings) {
            etPhMin.setText(s.phMin)
            etPhMax.setText(s.phMax)
            etEcMin.setText(s.tdsMin)
            etEcMax.setText(s.tdsMax)
            etTempMin.setText(s.tempMin)
            etTempMax.setText(s.tempMax)
            etHumMin.setText(s.humMin)
            etHumMax.setText(s.humMax)
            etBroker.setText(s.mqttBroker)
            etTopicSub.setText(s.mqttTopicSub)
            etTopicPub.setText(s.mqttTopicPub)
            etTopicStatus.setText(s.mqttTopicStatus)
            etIntervalMin.setText(s.intervalMinutes)
            etEcTarget.setText(s.ecTarget)
            etPhUp.setText(s.phUpDose)
            etPhDown.setText(s.phDownDose)
            val idx = providerKeys.indexOf(s.aiProvider).coerceAtLeast(0)
            spProvider.setSelection(idx)
            etApiKey.setText(s.apiKey)
            etApiKey.hint = placeholders[providerKeys[idx]] ?: "Masukkan API Key..."
        }

        populateFields(prefs.getSettings())

        spProvider.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                val key = providerKeys.getOrElse(pos) { "gemini" }
                etApiKey.hint = placeholders[key] ?: "Masukkan API Key..."
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        etApiKey.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val k = s?.toString()?.trim().orEmpty()
                val detected = when {
                    k.startsWith("AIza") -> "gemini"
                    k.startsWith("gsk_") -> "groq"
                    k.startsWith("sk-or-") -> "openrouter"
                    else -> ""
                }
                val curProvider = providerKeys.getOrElse(spProvider.selectedItemPosition) { "gemini" }
                if (detected.isNotEmpty() && !(detected == "groq" && curProvider == "qwen")) {
                    val idx = providerKeys.indexOf(detected)
                    if (idx >= 0) spProvider.setSelection(idx)
                }
            }
        })

        btnReset.setOnClickListener {
            val defaults = prefs.resetSettings()
            populateFields(defaults)
            onReset(defaults)
        }

        btnSave.setOnClickListener {
            val current = prefs.getSettings()
            val selectedProvider = providerKeys.getOrElse(spProvider.selectedItemPosition) { "gemini" }
            val updated = current.copy(
                phMin = etPhMin.text.toString().trim().ifEmpty { current.phMin },
                phMax = etPhMax.text.toString().trim().ifEmpty { current.phMax },
                tdsMin = etEcMin.text.toString().trim().ifEmpty { current.tdsMin },
                tdsMax = etEcMax.text.toString().trim().ifEmpty { current.tdsMax },
                tempMin = etTempMin.text.toString().trim().ifEmpty { current.tempMin },
                tempMax = etTempMax.text.toString().trim().ifEmpty { current.tempMax },
                humMin = etHumMin.text.toString().trim().ifEmpty { current.humMin },
                humMax = etHumMax.text.toString().trim().ifEmpty { current.humMax },
                mqttBroker = if (isAdmin) etBroker.text.toString().trim().ifEmpty { DashboardSettings.DEFAULT_BROKER_URL } else current.mqttBroker,
                mqttTopicSub = if (isAdmin) etTopicSub.text.toString().trim().ifEmpty { DashboardSettings.DEFAULT_TOPIC_SENSOR } else current.mqttTopicSub,
                mqttTopicPub = if (isAdmin) etTopicPub.text.toString().trim().ifEmpty { DashboardSettings.DEFAULT_TOPIC_CONTROL } else current.mqttTopicPub,
                mqttTopicStatus = if (isAdmin) etTopicStatus.text.toString().trim().ifEmpty { DashboardSettings.DEFAULT_TOPIC_STATUS } else current.mqttTopicStatus,
                intervalMinutes = if (isAdmin) etIntervalMin.text.toString().trim().ifEmpty { "1" } else current.intervalMinutes,
                ecTarget = if (isAdmin) etEcTarget.text.toString().trim().ifEmpty { "1.5" } else current.ecTarget,
                phUpDose = if (isAdmin) etPhUp.text.toString().trim().ifEmpty { "2" } else current.phUpDose,
                phDownDose = if (isAdmin) etPhDown.text.toString().trim().ifEmpty { "2" } else current.phDownDose,
                aiProvider = selectedProvider,
                apiKey = etApiKey.text.toString().trim()
            )

            prefs.saveSettings(updated)
            val result = onSave(updated)
            when (result) {
                "sent" -> {
                    btnSave.text = "SAVED & SENT ✓"
                    btnSave.backgroundTintList = ColorStateList.valueOf(0xFF1B4332.toInt())
                }
                "queued" -> {
                    btnSave.text = "SAVED (MENUNGGU MQTT)"
                    btnSave.backgroundTintList = ColorStateList.valueOf(0xFFE65100.toInt())
                }
                "viewer" -> {
                    btnSave.text = "SAVED ✓"
                    btnSave.backgroundTintList = ColorStateList.valueOf(0xFF1B4332.toInt())
                }
                else -> {
                    btnSave.text = "SAVED (MQTT OFFLINE)"
                    btnSave.backgroundTintList = ColorStateList.valueOf(0xFFC62828.toInt())
                }
            }
            Handler(Looper.getMainLooper()).postDelayed({
                if (dialog.isShowing) dialog.dismiss()
            }, 650)
        }

        dialog.show()
    }
}
