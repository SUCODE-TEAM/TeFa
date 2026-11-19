package id.tefa.smartgreenhouse.ui.dialog

import android.Manifest
import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import id.tefa.smartgreenhouse.R
import id.tefa.smartgreenhouse.data.PreferencesManager
import id.tefa.smartgreenhouse.network.AiAssistantClient
import id.tefa.smartgreenhouse.network.TelemetrySummarySnapshot
import id.tefa.smartgreenhouse.ui.custom.VoiceOrbView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import java.util.UUID

class AiAssistantDialog(
    private val context: Context,
    private val prefs: PreferencesManager,
    private val getTelemetrySnapshot: () -> TelemetrySummarySnapshot,
    private val requestMicPermission: (onGranted: () -> Unit) -> Unit
) {
    private data class ChatEntry(val isUser: Boolean, val badge: String, val text: String)

    private val chatHistory = mutableListOf<ChatEntry>()
    private var ttsEnabled = true
    private var isListening = false
    private var isSpeaking = false
    private var orbModeActive = false
    private var orbSizeDp = 220

    private var dialog: Dialog? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speechRecognizer: SpeechRecognizer? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var activeSpeakBtn: TextView? = null

    private lateinit var chatContainer: View
    private lateinit var orbPanel: View
    private lateinit var orbView: VoiceOrbView
    private lateinit var orbStatusBadge: TextView
    private lateinit var orbTranscript: TextView
    private lateinit var messagesLayout: LinearLayout
    private lateinit var messagesScroll: ScrollView
    private lateinit var inputEt: EditText
    private lateinit var btnTtsToggle: ImageButton
    private lateinit var btnMic: ImageButton
    private lateinit var btnOrbMic: MaterialButton

    fun show() {
        val d = Dialog(context)
        d.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val view = LayoutInflater.from(context).inflate(R.layout.dialog_ai_assistant, null)
        d.setContentView(view)
        d.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(
                (context.resources.displayMetrics.widthPixels * 0.94).toInt(),
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        chatContainer = view.findViewById(R.id.aiChatContainer)
        orbPanel = view.findViewById(R.id.aiVoiceOrbPanel)
        orbView = view.findViewById(R.id.aiVoiceOrbView)
        orbStatusBadge = view.findViewById(R.id.aiOrbStatusBadge)
        orbTranscript = view.findViewById(R.id.aiOrbTranscript)
        messagesLayout = view.findViewById(R.id.aiChatMessages)
        messagesScroll = view.findViewById(R.id.aiMessagesScroll)
        inputEt = view.findViewById(R.id.aiInput)
        btnTtsToggle = view.findViewById(R.id.aiBtnTtsToggle)
        btnMic = view.findViewById(R.id.aiBtnMic)
        btnOrbMic = view.findViewById(R.id.aiOrbMicBtn)

        val btnVoiceOrb = view.findViewById<ImageButton>(R.id.aiBtnVoiceOrb)
        val btnClear = view.findViewById<TextView>(R.id.aiBtnClear)
        val btnClose = view.findViewById<ImageButton>(R.id.aiBtnClose)
        val btnSend = view.findViewById<MaterialButton>(R.id.aiBtnSend)
        val btnSizeDown = view.findViewById<MaterialButton>(R.id.aiOrbSizeDownBtn)
        val btnSizeUp = view.findViewById<MaterialButton>(R.id.aiOrbSizeUpBtn)
        val btnOrbBack = view.findViewById<MaterialButton>(R.id.aiOrbBackBtn)

        initTts()
        updateTtsButtonUi()
        renderExistingHistory()

        if (chatHistory.isEmpty()) {
            val welcome = "Halo! Saya Asisten AI Greenhouse TeFa. Tanyakan kondisi pH, EC, suhu air, atau cuaca greenhouse."
            addBotBubble("AI", welcome, autoSpeak = false, saveToHistory = true)
        }

        btnClose.setOnClickListener { d.dismiss() }
        btnTtsToggle.setOnClickListener {
            ttsEnabled = !ttsEnabled
            if (!ttsEnabled) stopSpeaking()
            updateTtsButtonUi()
        }
        btnClear.setOnClickListener {
            stopSpeaking()
            stopListening()
            chatHistory.clear()
            messagesLayout.removeAllViews()
            orbTranscript.text = "Ketuk orb untuk mulai bertanya dengan suara mengenai kondisi pH, EC, suhu, atau cuaca."
        }
        btnVoiceOrb.setOnClickListener {
            if (orbModeActive) switchToChatMode() else switchToOrbMode()
        }
        btnOrbBack.setOnClickListener { switchToChatMode() }

        btnSizeDown.setOnClickListener {
            orbSizeDp = (orbSizeDp - 28).coerceIn(130, 300)
            applyOrbSize()
        }
        btnSizeUp.setOnClickListener {
            orbSizeDp = (orbSizeDp + 28).coerceIn(130, 300)
            applyOrbSize()
        }
        orbView.setOnClickListener { toggleListeningWithPermission() }
        btnMic.setOnClickListener {
            switchToOrbMode()
            toggleListeningWithPermission()
        }
        btnOrbMic.setOnClickListener { toggleListeningWithPermission() }

        btnSend.setOnClickListener {
            val txt = inputEt.text?.toString()?.trim().orEmpty()
            if (txt.isNotEmpty()) {
                inputEt.setText("")
                sendMessage(txt, fromVoice = false)
            }
        }
        inputEt.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                val txt = inputEt.text?.toString()?.trim().orEmpty()
                if (txt.isNotEmpty()) {
                    inputEt.setText("")
                    sendMessage(txt, fromVoice = false)
                }
                true
            } else false
        }

        d.setOnDismissListener {
            stopListening()
            stopSpeaking()
            orbView.stopAnimation()
            speechRecognizer?.destroy()
            speechRecognizer = null
            tts?.shutdown()
            tts = null
            ttsReady = false
        }

        dialog = d
        d.show()
    }

    private fun initTts() {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val idLocale = Locale.forLanguageTag("id-ID")
                val res = tts?.setLanguage(idLocale)
                if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts?.language = Locale.getDefault()
                }
                tts?.setSpeechRate(1.02f)
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        scope.launch {
                            isSpeaking = true
                            if (!isListening) {
                                orbView.setMode(VoiceOrbView.OrbMode.SPEAKING)
                                orbStatusBadge.text = "AI Sedang Berbicara..."
                            }
                        }
                    }

                    override fun onDone(utteranceId: String?) {
                        scope.launch { resetAfterSpeech() }
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        scope.launch { resetAfterSpeech() }
                    }
                })
                ttsReady = true
            }
        }
    }

    private fun resetAfterSpeech() {
        isSpeaking = false
        activeSpeakBtn?.text = "Dengarkan"
        activeSpeakBtn = null
        if (!isListening) {
            orbView.setMode(VoiceOrbView.OrbMode.IDLE)
            orbStatusBadge.text = "Ketuk Orb untuk Bicara"
        }
    }

    private fun stopSpeaking() {
        tts?.stop()
        resetAfterSpeech()
    }

    private fun speakText(text: String, btn: TextView?) {
        if (!ttsReady) return
        val clickedSame = btn != null && activeSpeakBtn === btn && isSpeaking
        stopSpeaking()
        if (clickedSame) return

        val clean = text.replace(Regex("\\s+"), " ").trim()
        if (clean.isEmpty()) return

        if (btn != null) {
            activeSpeakBtn = btn
            btn.text = "Berhenti"
        }
        val id = UUID.randomUUID().toString()
        tts?.speak(clean, TextToSpeech.QUEUE_FLUSH, null, id)
    }

    private fun updateTtsButtonUi() {
        btnTtsToggle.setImageResource(if (ttsEnabled) R.drawable.ic_volume_on else R.drawable.ic_volume_off)
        btnTtsToggle.setBackgroundResource(if (ttsEnabled) R.drawable.bg_circle_btn else R.drawable.bg_pill_chip)
    }

    private fun switchToOrbMode() {
        orbModeActive = true
        chatContainer.visibility = View.GONE
        orbPanel.visibility = View.VISIBLE
        applyOrbSize()
        orbView.startAnimation()
    }

    private fun switchToChatMode() {
        orbModeActive = false
        stopListening()
        orbView.stopAnimation()
        orbPanel.visibility = View.GONE
        chatContainer.visibility = View.VISIBLE
    }

    private fun applyOrbSize() {
        val px = (orbSizeDp * context.resources.displayMetrics.density).toInt()
        orbView.layoutParams = orbView.layoutParams.apply {
            width = px
            height = px
        }
        orbView.requestLayout()
    }

    private fun toggleListeningWithPermission() {
        if (isListening) {
            stopListening()
            return
        }
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            startListening()
        } else {
            requestMicPermission { startListening() }
        }
    }

    private fun startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            orbStatusBadge.text = "Mikrofon Tidak Didukung"
            orbTranscript.text = "Layanan pengenalan suara belum tersedia di perangkat ini."
            return
        }
        stopSpeaking()
        if (!orbModeActive) switchToOrbMode()

        if (speechRecognizer == null) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
        }
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                isListening = true
                orbView.setMode(VoiceOrbView.OrbMode.LISTENING)
                orbStatusBadge.text = "Mendengarkan..."
                orbTranscript.text = "Silakan bicara sekarang..."
                btnOrbMic.text = "Stop"
            }

            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {
                orbView.triggerPulse(((rmsdB + 2f) / 12f).coerceIn(0.1f, 1f))
            }

            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {
                isListening = false
                btnOrbMic.text = "Bicara"
            }

            override fun onError(error: Int) {
                isListening = false
                btnOrbMic.text = "Bicara"
                if (!isSpeaking) orbView.setMode(VoiceOrbView.OrbMode.IDLE)
                orbStatusBadge.text = "Ketuk Orb untuk Bicara"
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    orbTranscript.text = "Izinkan akses mikrofon agar dapat bertanya lewat suara."
                } else if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    orbTranscript.text = "Tidak ada suara terdeteksi. Ketuk orb dan coba bicara lagi."
                }
            }

            override fun onResults(results: Bundle?) {
                isListening = false
                btnOrbMic.text = "Bicara"
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
                if (text.isNotEmpty()) {
                    orbTranscript.text = text
                    orbStatusBadge.text = "Memproses jawaban..."
                    sendMessage(text, fromVoice = true)
                } else if (!isSpeaking) {
                    orbView.setMode(VoiceOrbView.OrbMode.IDLE)
                    orbStatusBadge.text = "Ketuk Orb untuk Bicara"
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
                if (partial.isNotEmpty()) {
                    orbTranscript.text = partial
                    orbView.triggerPulse(0.85f)
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "id-ID")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        speechRecognizer?.startListening(intent)
    }

    private fun stopListening() {
        isListening = false
        btnOrbMic.text = "Bicara"
        try {
            speechRecognizer?.stopListening()
        } catch (_: Exception) {
        }
        if (!isSpeaking) {
            orbView.setMode(VoiceOrbView.OrbMode.IDLE)
            orbStatusBadge.text = "Ketuk Orb untuk Bicara"
        }
    }

    private fun sendMessage(userText: String, fromVoice: Boolean) {
        addUserBubble(userText, saveToHistory = true)

        val settings = prefs.getSettings()
        val snapshot = getTelemetrySnapshot()
        val shouldSpeak = fromVoice || ttsEnabled

        if (settings.apiKey.isBlank()) {
            val reply = AiAssistantClient.generateLocalFallbackReply(userText, snapshot)
            if (orbModeActive) {
                orbTranscript.text = reply
                if (!shouldSpeak) {
                    orbView.setMode(VoiceOrbView.OrbMode.IDLE)
                    orbStatusBadge.text = "Ketuk Orb untuk Bicara"
                }
            }
            addBotBubble("AI", reply, autoSpeak = shouldSpeak, saveToHistory = true)
            return
        }

        val spec = AiAssistantClient.providers[settings.aiProvider] ?: AiAssistantClient.providers.getValue("gemini")
        if (orbModeActive) {
            orbStatusBadge.text = "Menghubungkan ke ${spec.label}..."
        }

        val pendingView = addPendingBubble("AI · ${spec.label}")
        scope.launch {
            val res = AiAssistantClient.askAi(settings.aiProvider, settings.apiKey, userText, snapshot)
            withContext(Dispatchers.Main) {
                messagesLayout.removeView(pendingView)
                val reply = res.getOrElse { err ->
                    "Gagal terhubung ke ${spec.label} (${err.message ?: "Error"}). " +
                        AiAssistantClient.generateLocalFallbackReply(userText, snapshot)
                }
                if (orbModeActive) {
                    orbTranscript.text = reply
                    if (!shouldSpeak) {
                        orbView.setMode(VoiceOrbView.OrbMode.IDLE)
                        orbStatusBadge.text = "Ketuk Orb untuk Bicara"
                    }
                }
                addBotBubble("AI · ${spec.label}", reply, autoSpeak = shouldSpeak, saveToHistory = true)
            }
        }
    }

    private fun renderExistingHistory() {
        messagesLayout.removeAllViews()
        for (entry in chatHistory) {
            if (entry.isUser) {
                addUserBubble(entry.text, saveToHistory = false)
            } else {
                addBotBubble(entry.badge, entry.text, autoSpeak = false, saveToHistory = false)
            }
        }
    }

    private fun addUserBubble(text: String, saveToHistory: Boolean) {
        if (saveToHistory) chatHistory.add(ChatEntry(true, "User", text))
        val density = context.resources.displayMetrics.density
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (8 * density).toInt() }
        }
        val bg = GradientDrawable().apply {
            cornerRadius = 12f * density
            setColor(ContextCompat.getColor(context, R.color.tefa_g9))
        }
        val tv = TextView(context).apply {
            this.text = text
            background = bg
            setTextColor(Color.WHITE)
            textSize = 13f
            maxWidth = (260 * density).toInt()
            setPadding((12 * density).toInt(), (9 * density).toInt(), (12 * density).toInt(), (9 * density).toInt())
        }
        row.addView(tv)
        messagesLayout.addView(row)
        scrollToBottom()
    }

    private fun addPendingBubble(badgeLabel: String): View {
        val density = context.resources.displayMetrics.density
        val bg = GradientDrawable().apply {
            cornerRadius = 12f * density
            setColor(Color.WHITE)
            setStroke((1 * density).toInt(), ContextCompat.getColor(context, R.color.tefa_g2))
        }
        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = bg
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (8 * density).toInt()
                marginEnd = (28 * density).toInt()
            }
            setPadding((12 * density).toInt(), (10 * density).toInt(), (12 * density).toInt(), (10 * density).toInt())
            addView(TextView(context).apply {
                text = badgeLabel
                setTextColor(ContextCompat.getColor(context, R.color.tefa_g5))
                textSize = 11f
                setTypeface(null, Typeface.BOLD)
            })
            addView(TextView(context).apply {
                text = "Sedang memproses..."
                setTextColor(ContextCompat.getColor(context, R.color.tefa_mute))
                textSize = 13f
                setPadding(0, (4 * density).toInt(), 0, 0)
            })
        }
        messagesLayout.addView(card)
        scrollToBottom()
        return card
    }

    private fun addBotBubble(badgeLabel: String, replyText: String, autoSpeak: Boolean, saveToHistory: Boolean) {
        if (saveToHistory) chatHistory.add(ChatEntry(false, badgeLabel, replyText))
        val density = context.resources.displayMetrics.density
        val bg = GradientDrawable().apply {
            cornerRadius = 12f * density
            setColor(Color.WHITE)
            setStroke((1 * density).toInt(), ContextCompat.getColor(context, R.color.tefa_g2))
        }
        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = bg
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (8 * density).toInt()
                marginEnd = (20 * density).toInt()
            }
            setPadding((12 * density).toInt(), (10 * density).toInt(), (12 * density).toInt(), (10 * density).toInt())
        }

        val head = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val badgeBg = GradientDrawable().apply {
            cornerRadius = 99f * density
            setColor(ContextCompat.getColor(context, R.color.tefa_g1))
        }
        head.addView(TextView(context).apply {
            text = badgeLabel
            background = badgeBg
            setTextColor(ContextCompat.getColor(context, R.color.tefa_g9))
            textSize = 10.5f
            setTypeface(null, Typeface.BOLD)
            setPadding((8 * density).toInt(), (2 * density).toInt(), (8 * density).toInt(), (2 * density).toInt())
        })
        head.addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) })

        val speakBtn = TextView(context).apply {
            text = "Dengarkan"
            setTextColor(ContextCompat.getColor(context, R.color.tefa_g5))
            textSize = 11.5f
            setTypeface(null, Typeface.BOLD)
            setPadding((8 * density).toInt(), (4 * density).toInt(), (4 * density).toInt(), (4 * density).toInt())
            setOnClickListener { speakText(replyText, this) }
        }
        head.addView(speakBtn)
        card.addView(head)

        card.addView(TextView(context).apply {
            text = replyText
            setTextColor(ContextCompat.getColor(context, R.color.tefa_g9))
            textSize = 13f
            setPadding(0, (6 * density).toInt(), 0, 0)
        })

        messagesLayout.addView(card)
        scrollToBottom()

        if (autoSpeak) {
            speakText(replyText, speakBtn)
        }
    }

    private fun scrollToBottom() {
        messagesScroll.post { messagesScroll.fullScroll(View.FOCUS_DOWN) }
    }
}
