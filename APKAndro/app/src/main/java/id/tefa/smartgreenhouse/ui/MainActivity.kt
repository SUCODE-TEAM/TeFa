package id.tefa.smartgreenhouse.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import id.tefa.smartgreenhouse.util.WhatsAppNotificationHelper
import java.util.Locale

class MainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private lateinit var webView: WebView
    private var textToSpeech: TextToSpeech? = null
    private var isTtsReady = false

    private var pendingCsvContent: String? = null
    private var pendingCsvFilename: String = "data_sensor_tefa.csv"
    private var pendingPermissionRequest: PermissionRequest? = null
    private var lastNotifStatus: String? = null

    private val notifPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            Toast.makeText(
                this,
                "Aktifkan izin notifikasi agar peringatan sensor muncul seperti WhatsApp.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val req = pendingPermissionRequest
        pendingPermissionRequest = null
        if (req != null) {
            if (granted) {
                req.grant(req.resources)
            } else {
                req.deny()
            }
        }
    }

    private val csvExportLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("text/csv")
    ) { uri: Uri? ->
        val csvData = pendingCsvContent
        val filename = pendingCsvFilename
        pendingCsvContent = null
        if (uri != null && csvData != null) {
            try {
                contentResolver.openOutputStream(uri)?.use { os ->
                    os.write(csvData.toByteArray(Charsets.UTF_8))
                    os.flush()
                }
                val rowCount = (csvData.lines().count { it.isNotBlank() } - 1).coerceAtLeast(0)
                Toast.makeText(this, "CSV berhasil disimpan ($rowCount data)", Toast.LENGTH_SHORT).show()
                WhatsAppNotificationHelper.showCsvSavedNotification(this, filename, rowCount)
            } catch (e: Exception) {
                Toast.makeText(this, "Gagal menyimpan CSV: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        WhatsAppNotificationHelper.ensureChannels(this)
        requestNotificationPermissionIfNeeded()

        textToSpeech = TextToSpeech(this, this)

        val rootContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#EEF2F0"))
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#EEF2F0"))
            overScrollMode = WebView.OVER_SCROLL_NEVER
        }

        rootContainer.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(rootContainer)

        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        configureWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (this@MainActivity::webView.isInitialized && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        webView.loadUrl("file:///android_asset/www/indexViewer.html")
        handleOpenNotificationsIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOpenNotificationsIntent(intent)
    }

    private fun handleOpenNotificationsIntent(intent: Intent?) {
        if (intent?.getBooleanExtra("open_notifications", false) == true && this::webView.isInitialized) {
            webView.postDelayed({
                webView.evaluateJavascript("document.getElementById('notifBtn')?.click();", null)
            }, 300L)
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "AllowAllFileAccess")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("file:///android_asset/")) {
                    return false
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false
                }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onJsAlert(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("TeFa Smart Greenhouse")
                    .setMessage(message ?: "")
                    .setPositiveButton("OK") { _, _ -> result?.confirm() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val wantsAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (wantsAudio) {
                        val hasMic = ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                        if (hasMic) {
                            request.grant(request.resources)
                        } else {
                            pendingPermissionRequest = request
                            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    } else {
                        request.deny()
                    }
                }
            }
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val idLocale = Locale.Builder().setLanguage("id").setRegion("ID").build()
            val res = textToSpeech?.setLanguage(idLocale)
            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                textToSpeech?.language = Locale.getDefault()
            }
            isTtsReady = true
        }
    }

    override fun onDestroy() {
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        if (this::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    inner class AndroidBridge {

        @JavascriptInterface
        fun postNotification(
            title: String?,
            desc: String?,
            valueSummary: String?,
            isWarning: Boolean,
            timeText: String?
        ) {
            runOnUiThread {
                val shouldNotify = isWarning || lastNotifStatus == "warning"
                lastNotifStatus = if (isWarning) "warning" else "normal"
                if (shouldNotify) {
                    WhatsAppNotificationHelper.showSensorNotification(
                        context = this@MainActivity,
                        title = title.orEmpty(),
                        desc = desc.orEmpty(),
                        valueSummary = valueSummary.orEmpty(),
                        isWarning = isWarning,
                        timeText = timeText.orEmpty()
                    )
                }
            }
        }

        @JavascriptInterface
        fun downloadCsv(filename: String?, csvContent: String?) {
            val safeName = filename?.takeIf { it.isNotBlank() } ?: "data_sensor_tefa.csv"
            val content = csvContent ?: return
            runOnUiThread {
                pendingCsvFilename = safeName
                pendingCsvContent = content
                csvExportLauncher.launch(safeName)
            }
        }

        @JavascriptInterface
        fun speakText(text: String?) {
            val clean = text?.trim()?.takeIf { it.isNotEmpty() } ?: return
            runOnUiThread {
                if (isTtsReady) {
                    textToSpeech?.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "tefa_ai_tts")
                }
            }
        }

        @JavascriptInterface
        fun stopSpeaking() {
            runOnUiThread {
                textToSpeech?.stop()
            }
        }
    }
}
