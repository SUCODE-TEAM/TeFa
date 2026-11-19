package id.tefa.smartgreenhouse.ui

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TableLayout
import android.widget.TableRow
import android.widget.TextView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.widget.NestedScrollView
import com.google.android.material.button.MaterialButton
import id.tefa.smartgreenhouse.R
import id.tefa.smartgreenhouse.data.PreferencesManager
import id.tefa.smartgreenhouse.data.SessionStore
import id.tefa.smartgreenhouse.model.AwsHistoryRow
import id.tefa.smartgreenhouse.model.DashboardSettings
import id.tefa.smartgreenhouse.model.DeviceStatusPayload
import id.tefa.smartgreenhouse.model.NormalizedTelemetry
import id.tefa.smartgreenhouse.model.NotificationBuilder
import id.tefa.smartgreenhouse.model.SensorHistoryRow
import id.tefa.smartgreenhouse.model.SensorNotification
import id.tefa.smartgreenhouse.model.TelemetryLogPoint
import id.tefa.smartgreenhouse.model.TimeRangeAggregator
import id.tefa.smartgreenhouse.network.MqttClientManager
import id.tefa.smartgreenhouse.network.SupabaseClient
import id.tefa.smartgreenhouse.network.TelemetrySummarySnapshot
import id.tefa.smartgreenhouse.ui.custom.MiniTrendBarsView
import id.tefa.smartgreenhouse.ui.custom.TelemetryChartView
import id.tefa.smartgreenhouse.ui.custom.WaterTempDonutView
import id.tefa.smartgreenhouse.ui.dialog.AiAssistantDialog
import id.tefa.smartgreenhouse.ui.dialog.NotificationDialog
import id.tefa.smartgreenhouse.ui.dialog.SettingsDialog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: PreferencesManager
    private lateinit var mqttManager: MqttClientManager
    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val handler = Handler(Looper.getMainLooper())

    // Navigation & Header
    private lateinit var mainScrollView: NestedScrollView
    private lateinit var navUserRoleLabel: TextView
    private lateinit var navChipDashboard: TextView
    private lateinit var navChipRelay: TextView
    private lateinit var navChipTelemetri: TextView
    private lateinit var navChipHardware: TextView
    private lateinit var navChipAws: TextView
    private lateinit var notifBadge: TextView

    // Sections
    private lateinit var sectionTop: View
    private lateinit var sectionRelay: View
    private lateinit var sectionTelemetri: View
    private lateinit var sectionHardware: View
    private lateinit var sectionAws: View

    // Hero Hardware Health
    private lateinit var uptimeValue: TextView
    private lateinit var hwEspVal: TextView
    private lateinit var hwEspSub: TextView
    private lateinit var hwPhVal: TextView
    private lateinit var hwPhSub: TextView
    private lateinit var hwTdsVal: TextView
    private lateinit var hwTdsSub: TextView
    private lateinit var hwLightVal: TextView
    private lateinit var hwLightSub: TextView
    private lateinit var hwRelayVal: TextView
    private lateinit var hwRelaySub: TextView
    private lateinit var hwRelayTile: View

    // Weather & Sensor Cards
    private lateinit var dateText: TextView
    private lateinit var weatherTempText: TextView
    private lateinit var weatherDescText: TextView
    private lateinit var weatherHumVal: TextView
    private lateinit var weatherMinVal: TextView
    private lateinit var weatherMaxVal: TextView

    private lateinit var sensorPhVal: TextView
    private lateinit var sensorPhBar: ProgressBar
    private lateinit var sensorPhStatus: TextView
    private lateinit var sensorTdsVal: TextView
    private lateinit var sensorTdsBar: ProgressBar
    private lateinit var sensorTdsStatus: TextView
    private lateinit var sensorLightVal: TextView
    private lateinit var sensorLightBar: ProgressBar
    private lateinit var sensorLightStatus: TextView

    // Water Temp & Threshold Monitor
    private lateinit var waterTempDonut: WaterTempDonutView
    private lateinit var waterTempMin: TextView
    private lateinit var waterTempStatus: TextView
    private lateinit var waterTempMax: TextView

    private lateinit var thrPhVal: TextView
    private lateinit var thrPhBar: ProgressBar
    private lateinit var thrTdsVal: TextView
    private lateinit var thrTdsBar: ProgressBar
    private lateinit var thrWtVal: TextView
    private lateinit var thrWtBar: ProgressBar
    private lateinit var thrHumVal: TextView
    private lateinit var thrHumBar: ProgressBar
    private lateinit var thrLightVal: TextView
    private lateinit var thrLightBar: ProgressBar

    // Relay Controls
    private lateinit var btnInjectAb: MaterialButton
    private lateinit var btnAllOn: MaterialButton
    private lateinit var btnAllOff: MaterialButton
    private lateinit var relayGridContainer: LinearLayout

    // Chart
    private lateinit var legendTds: TextView
    private lateinit var legendPh: TextView
    private lateinit var legendTemp: TextView
    private lateinit var tabRange1J: TextView
    private lateinit var tabRange24J: TextView
    private lateinit var tabRange7H: TextView
    private lateinit var tabRange30H: TextView
    private lateinit var telemetryChart: TelemetryChartView

    // Sensor History Table
    private lateinit var sensorHistoryTable: TableLayout
    private lateinit var sensorPageInfo: TextView
    private lateinit var sensorRowsPerPage: Spinner
    private lateinit var sensorPaginationBtns: LinearLayout

    // Hardware & AWS
    private lateinit var hardwareCardsRow: LinearLayout
    private lateinit var awsAirBadge: TextView
    private lateinit var awsAirTempVal: TextView
    private lateinit var awsAirHumVal: TextView
    private lateinit var awsAirBars: MiniTrendBarsView
    private lateinit var awsAirCap: TextView
    private lateinit var awsLuxBadge: TextView
    private lateinit var awsSolarVal: TextView
    private lateinit var awsParVal: TextView
    private lateinit var awsLuxBars: MiniTrendBarsView
    private lateinit var awsLuxCap: TextView
    private lateinit var tabAwsDaily: TextView
    private lateinit var tabAwsWeekly: TextView
    private lateinit var tabAwsMonthly: TextView
    private lateinit var awsHistoryTable: TableLayout
    private lateinit var awsPageInfo: TextView
    private lateinit var awsRowsPerPage: Spinner
    private lateinit var awsPaginationBtns: LinearLayout

    // State
    private var minWaterTemp: Double? = null
    private var maxWaterTemp: Double? = null
    private var minAirTemp: Double? = null
    private var maxAirTemp: Double? = null
    private var lastDeviceStatus: DeviceStatusPayload? = null
    private var lastNotifStatus: String? = null
    private var lastTelemetrySummary = TelemetrySummarySnapshot(
        sensorsSummary = "pH, Nutrisi, Cahaya N/A",
        weatherTemp = "N/A",
        weatherDesc = "Terputus",
        waterTemp = "N/A"
    )

    private val telemetryHistory = mutableListOf<TelemetryLogPoint>()
    private var telemetryLog = mutableListOf<TelemetryLogPoint>()

    private var activeRange = "24J"
    private var showEc = true
    private var showPh = true
    private var showTemp = true

    private var sensorHistoryData = mutableListOf<SensorHistoryRow>()
    private var sensorCurrentPage = 1
    private var sensorPerPage = 5

    private val awsHistoryMap = mutableMapOf(
        "daily" to mutableListOf<AwsHistoryRow>(),
        "weekly" to mutableListOf<AwsHistoryRow>(),
        "monthly" to mutableListOf<AwsHistoryRow>()
    )
    private var activeAwsTab = "daily"
    private var awsCurrentPage = 1
    private var awsPerPage = 4

    private val notificationsList = mutableListOf<SensorNotification>()
    private var unreadNotifCount = 0
    private var notifDialog: NotificationDialog? = null
    private var aiDialog: AiAssistantDialog? = null

    // Relay View Holders
    private data class RelayHolder(
        val relayNum: Int,
        val pumpKey: String?,
        val labelEyebrow: String,
        val title: String,
        val disabled: Boolean,
        val card: LinearLayout,
        val statusTv: TextView,
        val powerIcon: ImageView,
        var isActive: Boolean = false,
        var activeSeconds: Int = 0,
        var intervalMin: String? = null
    )

    private val relayHolders = mutableListOf<RelayHolder>()

    private var pendingMicAction: (() -> Unit)? = null
    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            pendingMicAction?.invoke()
        } else {
            Toast.makeText(this, "Izin mikrofon diperlukan untuk fitur suara AI", Toast.LENGTH_SHORT).show()
        }
        pendingMicAction = null
    }

    private val csvExportLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("text/csv")
    ) { uri: Uri? ->
        if (uri != null) {
            writeCsvToUri(uri)
        }
    }

    private val clockRunnable = object : Runnable {
        override fun run() {
            dateText.text = TimeRangeAggregator.formatFullIndonesianDate()
            handler.postDelayed(this, 30_000L)
        }
    }

    private val relayTimerRunnable = object : Runnable {
        override fun run() {
            for (h in relayHolders) {
                if (h.isActive && !h.disabled) {
                    h.activeSeconds += 1
                    val suffix = h.intervalMin?.let { " ($it mnt)" } ?: ""
                    h.statusTv.text = "Aktif · ${fmtTime(h.activeSeconds)}$suffix"
                }
            }
            handler.postDelayed(this, 1000L)
        }
    }

    private val supabaseRefreshRunnable = object : Runnable {
        override fun run() {
            loadHistoryFromSupabase()
            handler.postDelayed(this, 15_000L)
        }
    }

    private var isUserNavScrolling = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        val root = findViewById<View>(R.id.mainRoot)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        prefs = PreferencesManager(this)
        telemetryLog = prefs.getTelemetryLog()

        bindViews()
        setupNavAndModals()
        setupRelayGrid()
        setupHardwareCards()
        setupChartControls()
        setupTablesAndPagination()
        setupAwsTabs()

        applyRoleMode()

        if (telemetryLog.isNotEmpty()) {
            renderTelemetryChart()
            syncAwsHistoryTablesFromLog(includeDaily = true)
        }

        mqttManager = MqttClientManager(
            onConnectionState = { stateText, subText, isOnline ->
                setConnectionUi(stateText, subText, isOnline)
            },
            onTelemetryReceived = { payload ->
                handleIncomingTelemetry(payload)
            },
            onDeviceStatusReceived = { status ->
                handleIncomingDeviceStatus(status)
            }
        )

        val cfg = prefs.getSettings()
        mqttManager.updateConfig(
            cfg.mqttBroker,
            cfg.mqttTopicSub,
            cfg.mqttTopicPub,
            cfg.mqttTopicStatus
        )

        loadHistoryFromSupabase()
    }

    override fun onResume() {
        super.onResume()
        applyRoleMode()
        handler.removeCallbacks(clockRunnable)
        handler.post(clockRunnable)
        handler.removeCallbacks(relayTimerRunnable)
        handler.postDelayed(relayTimerRunnable, 1000L)
        handler.removeCallbacks(supabaseRefreshRunnable)
        handler.postDelayed(supabaseRefreshRunnable, 15_000L)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(clockRunnable)
        handler.removeCallbacks(relayTimerRunnable)
        handler.removeCallbacks(supabaseRefreshRunnable)
    }

    override fun onDestroy() {
        super.onDestroy()
        mqttManager.disconnect()
        uiScope.cancel()
        handler.removeCallbacksAndMessages(null)
    }

    private fun bindViews() {
        mainScrollView = findViewById(R.id.mainScrollView)
        navUserRoleLabel = findViewById(R.id.navUserRoleLabel)
        navChipDashboard = findViewById(R.id.navChipDashboard)
        navChipRelay = findViewById(R.id.navChipRelay)
        navChipTelemetri = findViewById(R.id.navChipTelemetri)
        navChipHardware = findViewById(R.id.navChipHardware)
        navChipAws = findViewById(R.id.navChipAws)
        notifBadge = findViewById(R.id.notifBadge)

        sectionTop = findViewById(R.id.sectionTop)
        sectionRelay = findViewById(R.id.sectionRelay)
        sectionTelemetri = findViewById(R.id.sectionTelemetri)
        sectionHardware = findViewById(R.id.sectionHardware)
        sectionAws = findViewById(R.id.sectionAws)

        uptimeValue = findViewById(R.id.uptimeValue)
        hwEspVal = findViewById(R.id.hwEspVal)
        hwEspSub = findViewById(R.id.hwEspSub)
        hwPhVal = findViewById(R.id.hwPhVal)
        hwPhSub = findViewById(R.id.hwPhSub)
        hwTdsVal = findViewById(R.id.hwTdsVal)
        hwTdsSub = findViewById(R.id.hwTdsSub)
        hwLightVal = findViewById(R.id.hwLightVal)
        hwLightSub = findViewById(R.id.hwLightSub)
        hwRelayVal = findViewById(R.id.hwRelayVal)
        hwRelaySub = findViewById(R.id.hwRelaySub)
        hwRelayTile = findViewById(R.id.hwRelayTile)

        dateText = findViewById(R.id.dateText)
        weatherTempText = findViewById(R.id.weatherTempText)
        weatherDescText = findViewById(R.id.weatherDescText)
        weatherHumVal = findViewById(R.id.weatherHumVal)
        weatherMinVal = findViewById(R.id.weatherMinVal)
        weatherMaxVal = findViewById(R.id.weatherMaxVal)

        sensorPhVal = findViewById(R.id.sensorPhVal)
        sensorPhBar = findViewById(R.id.sensorPhBar)
        sensorPhStatus = findViewById(R.id.sensorPhStatus)
        sensorTdsVal = findViewById(R.id.sensorTdsVal)
        sensorTdsBar = findViewById(R.id.sensorTdsBar)
        sensorTdsStatus = findViewById(R.id.sensorTdsStatus)
        sensorLightVal = findViewById(R.id.sensorLightVal)
        sensorLightBar = findViewById(R.id.sensorLightBar)
        sensorLightStatus = findViewById(R.id.sensorLightStatus)

        waterTempDonut = findViewById(R.id.waterTempDonut)
        waterTempMin = findViewById(R.id.waterTempMin)
        waterTempStatus = findViewById(R.id.waterTempStatus)
        waterTempMax = findViewById(R.id.waterTempMax)

        thrPhVal = findViewById(R.id.thrPhVal)
        thrPhBar = findViewById(R.id.thrPhBar)
        thrTdsVal = findViewById(R.id.thrTdsVal)
        thrTdsBar = findViewById(R.id.thrTdsBar)
        thrWtVal = findViewById(R.id.thrWtVal)
        thrWtBar = findViewById(R.id.thrWtBar)
        thrHumVal = findViewById(R.id.thrHumVal)
        thrHumBar = findViewById(R.id.thrHumBar)
        thrLightVal = findViewById(R.id.thrLightVal)
        thrLightBar = findViewById(R.id.thrLightBar)

        btnInjectAb = findViewById(R.id.btnInjectAb)
        btnAllOn = findViewById(R.id.btnAllOn)
        btnAllOff = findViewById(R.id.btnAllOff)
        relayGridContainer = findViewById(R.id.relayGridContainer)

        legendTds = findViewById(R.id.legendTds)
        legendPh = findViewById(R.id.legendPh)
        legendTemp = findViewById(R.id.legendTemp)
        tabRange1J = findViewById(R.id.tabRange1J)
        tabRange24J = findViewById(R.id.tabRange24J)
        tabRange7H = findViewById(R.id.tabRange7H)
        tabRange30H = findViewById(R.id.tabRange30H)
        telemetryChart = findViewById(R.id.telemetryChart)

        sensorHistoryTable = findViewById(R.id.sensorHistoryTable)
        sensorPageInfo = findViewById(R.id.sensorPageInfo)
        sensorRowsPerPage = findViewById(R.id.sensorRowsPerPage)
        sensorPaginationBtns = findViewById(R.id.sensorPaginationBtns)

        hardwareCardsRow = findViewById(R.id.hardwareCardsRow)
        awsAirBadge = findViewById(R.id.awsAirBadge)
        awsAirTempVal = findViewById(R.id.awsAirTempVal)
        awsAirHumVal = findViewById(R.id.awsAirHumVal)
        awsAirBars = findViewById(R.id.awsAirBars)
        awsAirCap = findViewById(R.id.awsAirCap)
        awsLuxBadge = findViewById(R.id.awsLuxBadge)
        awsSolarVal = findViewById(R.id.awsSolarVal)
        awsParVal = findViewById(R.id.awsParVal)
        awsLuxBars = findViewById(R.id.awsLuxBars)
        awsLuxCap = findViewById(R.id.awsLuxCap)
        tabAwsDaily = findViewById(R.id.tabAwsDaily)
        tabAwsWeekly = findViewById(R.id.tabAwsWeekly)
        tabAwsMonthly = findViewById(R.id.tabAwsMonthly)
        awsHistoryTable = findViewById(R.id.awsHistoryTable)
        awsPageInfo = findViewById(R.id.awsPageInfo)
        awsRowsPerPage = findViewById(R.id.awsRowsPerPage)
        awsPaginationBtns = findViewById(R.id.awsPaginationBtns)
    }

    private fun applyRoleMode() {
        val isAdmin = SessionStore.isAdmin()
        navUserRoleLabel.text = if (isAdmin) "Admin" else "Viewer"
        navChipRelay.visibility = if (isAdmin) View.VISIBLE else View.GONE
        sectionRelay.visibility = if (isAdmin) View.VISIBLE else View.GONE
    }

    private fun setupNavAndModals() {
        findViewById<View>(R.id.navUserBtn).setOnClickListener {
            if (!SessionStore.isAdmin()) {
                startActivity(Intent(this, LoginActivity::class.java))
            } else {
                AlertDialog.Builder(this)
                    .setTitle("Mode Administrator (${SessionStore.currentSession.username})")
                    .setMessage("Anda sedang masuk sebagai Admin dan dapat mengontrol aktuator relay serta pengaturan MQTT.")
                    .setPositiveButton("Logout ke Viewer") { _, _ ->
                        SessionStore.switchToViewer()
                        applyRoleMode()
                        selectNavChip(navChipDashboard)
                        mainScrollView.smoothScrollTo(0, 0)
                        Toast.makeText(this, "Kembali ke Mode Publik (Viewer)", Toast.LENGTH_SHORT).show()
                    }
                    .setNeutralButton("Ganti Akun") { _, _ ->
                        startActivity(Intent(this, LoginActivity::class.java))
                    }
                    .setNegativeButton("Tutup", null)
                    .show()
            }
        }

        navChipDashboard.setOnClickListener { scrollToSection(sectionTop, navChipDashboard) }
        navChipRelay.setOnClickListener { scrollToSection(sectionRelay, navChipRelay) }
        navChipTelemetri.setOnClickListener { scrollToSection(sectionTelemetri, navChipTelemetri) }
        navChipHardware.setOnClickListener { scrollToSection(sectionHardware, navChipHardware) }
        navChipAws.setOnClickListener { scrollToSection(sectionAws, navChipAws) }

        mainScrollView.setOnScrollChangeListener(NestedScrollView.OnScrollChangeListener { _, _, scrollY, _, _ ->
            if (isUserNavScrolling) return@OnScrollChangeListener
            val isAdmin = SessionStore.isAdmin()
            val pairs = mutableListOf(
                sectionTop to navChipDashboard
            )
            if (isAdmin) pairs.add(sectionRelay to navChipRelay)
            pairs.add(sectionTelemetri to navChipTelemetri)
            pairs.add(sectionHardware to navChipHardware)
            pairs.add(sectionAws to navChipAws)

            var activeChip = navChipDashboard
            val threshold = scrollY + 120
            for ((sec, chip) in pairs) {
                if (sec.top <= threshold) {
                    activeChip = chip
                }
            }
            selectNavChip(activeChip)
        })

        findViewById<ImageButton>(R.id.notifBtn).setOnClickListener {
            unreadNotifCount = 0
            updateNotifBadge()
            val dlg = notifDialog ?: NotificationDialog(this) { notificationsList }.also {
                notifDialog = it
            }
            dlg.show()
        }

        findViewById<ImageButton>(R.id.aiAssistantBtn).setOnClickListener {
            val dlg = aiDialog ?: AiAssistantDialog(
                context = this,
                prefs = prefs,
                getTelemetrySnapshot = { lastTelemetrySummary },
                requestMicPermission = { onGranted ->
                    pendingMicAction = onGranted
                    micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            ).also { aiDialog = it }
            dlg.show()
        }

        findViewById<ImageButton>(R.id.gearBtn).setOnClickListener {
            val isAdmin = SessionStore.isAdmin()
            SettingsDialog(
                context = this,
                prefs = prefs,
                isAdmin = isAdmin,
                onSave = { newSettings ->
                    if (isAdmin) {
                        mqttManager.updateConfig(
                            newSettings.mqttBroker,
                            newSettings.mqttTopicSub,
                            newSettings.mqttTopicPub,
                            newSettings.mqttTopicStatus
                        )
                        val payloadJson = prefs.buildControlPayloadJson(newSettings)
                        mqttManager.publishControl(payloadJson)
                    } else {
                        "viewer"
                    }
                },
                onReset = { defaults ->
                    if (isAdmin) {
                        for (h in relayHolders) {
                            updateRelayCardUi(h, false, null)
                        }
                        mqttManager.updateConfig(
                            defaults.mqttBroker,
                            defaults.mqttTopicSub,
                            defaults.mqttTopicPub,
                            defaults.mqttTopicStatus
                        )
                    }
                }
            ).show()
        }
    }

    private fun scrollToSection(target: View, chip: TextView) {
        isUserNavScrolling = true
        selectNavChip(chip)
        mainScrollView.smoothScrollTo(0, max(0, target.top - 16))
        handler.postDelayed({ isUserNavScrolling = false }, 550L)
    }

    private fun selectNavChip(selected: TextView) {
        val chips = listOf(navChipDashboard, navChipRelay, navChipTelemetri, navChipHardware, navChipAws)
        for (c in chips) {
            val on = c === selected
            c.setBackgroundResource(if (on) R.drawable.bg_pill_chip_active else R.drawable.bg_pill_chip)
            c.setTextColor(ContextCompat.getColor(this, if (on) R.color.tefa_white else R.color.tefa_g9))
        }
    }

    private fun setupRelayGrid() {
        val specs = listOf(
            Triple(1, "pump_A", "Nutrient Pump A"),
            Triple(2, "pump_B", "Nutrient Pump B"),
            Triple(3, "pump_up", "pH Up Pump"),
            Triple(4, "pump_down", "pH Down Pump"),
            Triple(5, "pump_big", "Main Pump (Big)"),
            Triple(6, null, "Coming Soon"),
            Triple(7, null, "Coming Soon"),
            Triple(8, null, "Coming Soon")
        )
        val density = resources.displayMetrics.density
        relayGridContainer.removeAllViews()
        relayHolders.clear()

        var rowLayout: LinearLayout? = null
        specs.forEachIndexed { idx, (num, pumpKey, title) ->
            if (idx % 2 == 0) {
                rowLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply { bottomMargin = (10 * density).toInt() }
                }
                relayGridContainer.addView(rowLayout)
            }

            val isDisabled = pumpKey == null
            val eyebrowText = when (pumpKey) {
                "pump_A" -> "RELAY 1 · PUMP A"
                "pump_B" -> "RELAY 2 · PUMP B"
                "pump_up" -> "RELAY 3 · PUMP UP"
                "pump_down" -> "RELAY 4 · PUMP DOWN"
                "pump_big" -> "RELAY 5 · PUMP BIG"
                else -> "RELAY $num"
            }

            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundResource(if (isDisabled) R.drawable.bg_relay_card_disabled else R.drawable.bg_relay_card_off)
                alpha = if (isDisabled) 0.58f else 1f
                setPadding((14 * density).toInt(), (12 * density).toInt(), (14 * density).toInt(), (12 * density).toInt())
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (idx % 2 == 0) marginEnd = (5 * density).toInt() else marginStart = (5 * density).toInt()
                }
            }

            val topRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val eyebrowTv = TextView(this).apply {
                text = eyebrowText
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_mute))
                textSize = 10.5f
                setTypeface(null, Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }
            val powerIcon = ImageView(this).apply {
                setImageResource(R.drawable.ic_power)
                setBackgroundResource(R.drawable.bg_circle_soft_green)
                val p = (6 * density).toInt()
                setPadding(p, p, p, p)
                layoutParams = LinearLayout.LayoutParams((30 * density).toInt(), (30 * density).toInt())
            }
            topRow.addView(eyebrowTv)
            topRow.addView(powerIcon)
            card.addView(topRow)

            card.addView(TextView(this).apply {
                text = title
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_g9))
                textSize = 14.5f
                setTypeface(null, Typeface.BOLD)
                setPadding(0, (8 * density).toInt(), 0, (4 * density).toInt())
            })

            val statusTv = TextView(this).apply {
                text = if (isDisabled) "Coming Soon" else "Mati"
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_mute))
                textSize = 12f
                setTypeface(null, Typeface.BOLD)
            }
            card.addView(statusTv)

            val holder = RelayHolder(
                relayNum = num,
                pumpKey = pumpKey,
                labelEyebrow = eyebrowText,
                title = title,
                disabled = isDisabled,
                card = card,
                statusTv = statusTv,
                powerIcon = powerIcon
            )
            relayHolders.add(holder)

            if (!isDisabled) {
                card.setOnClickListener {
                    val targetOn = !holder.isActive
                    setRelayPendingUi(holder, targetOn)
                    publishPumpCommand(mapOf(pumpKey!! to if (targetOn) "on" else "off"))
                }
            }
            rowLayout?.addView(card)
        }

        btnInjectAb.setOnClickListener {
            val activeNow = isAbMixActive()
            val nextOn = !activeNow
            btnInjectAb.text = "Inject AB Mix · ..."
            setRelaysState(nextOn, listOf("pump_A", "pump_B"))
        }
        btnAllOn.setOnClickListener { setRelaysState(true, null) }
        btnAllOff.setOnClickListener { setRelaysState(false, null) }
        syncInjectAbButtonState()
    }

    private fun isAbMixActive(): Boolean {
        val a = relayHolders.firstOrNull { it.pumpKey == "pump_A" }
        val b = relayHolders.firstOrNull { it.pumpKey == "pump_B" }
        return a?.isActive == true && b?.isActive == true
    }

    private fun syncInjectAbButtonState() {
        val active = isAbMixActive()
        btnInjectAb.text = if (active) "Inject AB Mix · ON" else "Inject AB Mix · OFF"
        btnInjectAb.setBackgroundColor(ContextCompat.getColor(this, if (active) R.color.tefa_g5 else R.color.tefa_g1))
        btnInjectAb.setTextColor(ContextCompat.getColor(this, if (active) R.color.tefa_white else R.color.tefa_g9))
    }

    private fun setRelayPendingUi(holder: RelayHolder, targetState: Boolean) {
        holder.statusTv.setTextColor(0xFFE65100.toInt())
        holder.statusTv.text = "Menunggu status (${if (targetState) "ON" else "OFF"})..."
    }

    private fun updateRelayCardUi(holder: RelayHolder, isOn: Boolean, intervalMinutes: Int?) {
        if (holder.disabled) return
        holder.isActive = isOn
        if (intervalMinutes != null) {
            holder.intervalMin = intervalMinutes.toString()
        }
        if (isOn) {
            holder.card.setBackgroundResource(R.drawable.bg_relay_card_on)
            holder.powerIcon.setBackgroundResource(R.drawable.bg_circle_btn)
            holder.powerIcon.setColorFilter(Color.WHITE)
            holder.activeSeconds = if (holder.activeSeconds > 0) holder.activeSeconds else 1
            holder.statusTv.setTextColor(ContextCompat.getColor(this, R.color.tefa_g9))
            val suffix = holder.intervalMin?.let { " ($it mnt)" } ?: ""
            holder.statusTv.text = "Aktif · ${fmtTime(holder.activeSeconds)}$suffix"
        } else {
            holder.card.setBackgroundResource(R.drawable.bg_relay_card_off)
            holder.powerIcon.setBackgroundResource(R.drawable.bg_circle_soft_green)
            holder.powerIcon.setColorFilter(ContextCompat.getColor(this, R.color.tefa_g9))
            holder.activeSeconds = 0
            holder.statusTv.setTextColor(ContextCompat.getColor(this, R.color.tefa_mute))
            holder.statusTv.text = "Mati"
        }
        if (holder.pumpKey == "pump_A" || holder.pumpKey == "pump_B") {
            syncInjectAbButtonState()
        }
    }

    private fun setRelaysState(isOn: Boolean, targetKeys: List<String>?) {
        val overrides = linkedMapOf<String, String>()
        var affected = false
        for (h in relayHolders) {
            if (h.disabled) continue
            val key = h.pumpKey ?: continue
            if (targetKeys != null && !targetKeys.contains(key)) continue
            affected = true
            setRelayPendingUi(h, isOn)
            overrides[key] = if (isOn) "on" else "off"
        }
        if (affected) {
            publishPumpCommand(overrides)
        }
    }

    private fun publishPumpCommand(overrides: Map<String, String>) {
        var settings = prefs.getSettings()
        for (h in relayHolders) {
            val key = h.pumpKey ?: continue
            val state = overrides[key] ?: if (h.isActive) "on" else "off"
            settings = settings.withPumpState(key, state)
        }
        prefs.saveSettings(settings)
        val payloadJson = prefs.buildControlPayloadJson(settings)
        mqttManager.publishControl(payloadJson)
    }

    private fun setupHardwareCards() {
        val items = listOf(
            Triple(R.drawable.ic_ph_flask, "Sensor pH", listOf("Modul: PH-4502C", "Range: 0 – 14 pH", "Pin: GPIO 34 (ADC)")),
            Triple(R.drawable.ic_drop_tds, "Sensor TDS", listOf("Modul: Gravity TDS", "Range: 0 – 1000+ ppm", "Pin: GPIO 35 (ADC)")),
            Triple(R.drawable.ic_sun_light, "Light Sensor", listOf("Modul: BH1750", "Range: 1 – 65535 lx", "Pin: I2C SDA 21 / SCL 22")),
            Triple(R.drawable.ic_thermometer, "Temp & Humidity", listOf("Modul: AHT10", "Range: -40 – 80 °C", "Pin: GPIO 4")),
            Triple(R.drawable.ic_plug_relay, "Modul Relay", listOf("Tipe: 8 Channel 5V", "Beban: 10A 250VAC", "Pin: GPIO 13 – 27"))
        )
        val density = resources.displayMetrics.density
        hardwareCardsRow.removeAllViews()
        for ((iconRes, title, specs) in items) {
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundResource(R.drawable.bg_card)
                setPadding((14 * density).toInt(), (14 * density).toInt(), (14 * density).toInt(), (14 * density).toInt())
                layoutParams = LinearLayout.LayoutParams((196 * density).toInt(), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    marginEnd = (10 * density).toInt()
                }
            }
            val iconBg = ImageView(this).apply {
                setImageResource(iconRes)
                setBackgroundResource(R.drawable.bg_circle_soft_green)
                val p = (10 * density).toInt()
                setPadding(p, p, p, p)
                if (iconRes == R.drawable.ic_plug_relay) {
                    setColorFilter(ContextCompat.getColor(this@MainActivity, R.color.tefa_g9))
                }
                layoutParams = LinearLayout.LayoutParams((46 * density).toInt(), (46 * density).toInt())
            }
            card.addView(iconBg)
            card.addView(TextView(this).apply {
                text = title
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_g9))
                textSize = 15f
                setTypeface(null, Typeface.BOLD)
                setPadding(0, (10 * density).toInt(), 0, (6 * density).toInt())
            })
            for (line in specs) {
                card.addView(TextView(this).apply {
                    text = "• $line"
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_mute))
                    textSize = 12f
                    setPadding(0, (2 * density).toInt(), 0, (2 * density).toInt())
                })
            }
            hardwareCardsRow.addView(card)
        }
    }

    private fun setupChartControls() {
        val rangeTabs = listOf(tabRange1J to "1J", tabRange24J to "24J", tabRange7H to "7H", tabRange30H to "30H")
        for ((tv, key) in rangeTabs) {
            tv.setOnClickListener {
                activeRange = key
                for ((tab, tabKey) in rangeTabs) {
                    val on = tabKey == activeRange
                    tab.setBackgroundResource(if (on) R.drawable.bg_pill_chip_active else R.drawable.bg_pill_chip)
                    tab.setTextColor(ContextCompat.getColor(this, if (on) R.color.tefa_white else R.color.tefa_g9))
                }
                renderTelemetryChart()
                loadHistoryFromSupabase()
            }
        }

        fun toggleSeries(key: String) {
            val activeCount = listOf(showEc, showPh, showTemp).count { it }
            when (key) {
                "ec" -> if (!(showEc && activeCount <= 1)) showEc = !showEc
                "ph" -> if (!(showPh && activeCount <= 1)) showPh = !showPh
                "temp" -> if (!(showTemp && activeCount <= 1)) showTemp = !showTemp
            }
            legendTds.alpha = if (showEc) 1f else 0.35f
            legendPh.alpha = if (showPh) 1f else 0.35f
            legendTemp.alpha = if (showTemp) 1f else 0.35f
            telemetryChart.setVisibleSeries(showEc, showPh, showTemp)
        }

        legendTds.setOnClickListener { toggleSeries("ec") }
        legendPh.setOnClickListener { toggleSeries("ph") }
        legendTemp.setOnClickListener { toggleSeries("temp") }
    }

    private fun renderTelemetryChart() {
        val series = TimeRangeAggregator.getSeriesForRange(telemetryLog, activeRange)
        telemetryChart.setData(series.points, showEc, showPh, showTemp)
    }

    private fun setupTablesAndPagination() {
        val sensorSizes = listOf("5", "10", "20")
        sensorRowsPerPage.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, sensorSizes).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        sensorRowsPerPage.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, pos: Int, id: Long) {
                sensorPerPage = sensorSizes[pos].toInt()
                sensorCurrentPage = 1
                renderSensorHistoryTable()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        findViewById<View>(R.id.btnDownloadCsv).setOnClickListener {
            if (sensorHistoryData.isEmpty()) {
                AlertDialog.Builder(this)
                    .setTitle("Ekspor CSV")
                    .setMessage("Peringatan: Sensor sedang terputus (N/A). Belum ada data pengukuran yang dapat diekspor.")
                    .setPositiveButton("OK", null)
                    .show()
                return@setOnClickListener
            }
            val dateStr = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            csvExportLauncher.launch("data_sensor_tefa_$dateStr.csv")
        }

        val awsSizes = listOf("4", "8", "12")
        awsRowsPerPage.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, awsSizes).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        awsRowsPerPage.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, pos: Int, id: Long) {
                awsPerPage = awsSizes[pos].toInt()
                awsCurrentPage = 1
                renderAwsHistoryTable()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        renderSensorHistoryTable()
        renderAwsHistoryTable()
    }

    private fun writeCsvToUri(uri: Uri) {
        try {
            val sb = StringBuilder()
            sb.append("Time,pH,ppm,water temp (C),LIGHT (lx),humidity,Status\r\n")
            for (r in sensorHistoryData) {
                sb.append("\"${r.time}\",\"${r.ph}\",\"${r.ppm}\",\"${r.temp}\",\"${r.light}\",\"${r.hum}\",\"${r.status}\"\r\n")
            }
            contentResolver.openOutputStream(uri)?.use { os ->
                os.write(sb.toString().toByteArray(Charsets.UTF_8))
                os.flush()
            }
            Toast.makeText(this, "CSV berhasil diekspor (${sensorHistoryData.size} baris)", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Gagal ekspor CSV: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupAwsTabs() {
        val tabs = listOf(tabAwsDaily to "daily", tabAwsWeekly to "weekly", tabAwsMonthly to "monthly")
        for ((tv, key) in tabs) {
            tv.setOnClickListener {
                activeAwsTab = key
                awsCurrentPage = 1
                for ((t, tKey) in tabs) {
                    val on = tKey == activeAwsTab
                    t.setBackgroundResource(if (on) R.drawable.bg_pill_chip_active else R.drawable.bg_pill_chip)
                    t.setTextColor(ContextCompat.getColor(this, if (on) R.color.tefa_white else R.color.tefa_g9))
                }
                renderAwsHistoryTable()
            }
        }
    }

    private fun renderSensorHistoryTable() {
        val density = resources.displayMetrics.density
        sensorHistoryTable.removeAllViews()

        val headerRow = TableRow(this).apply {
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_g1))
        }
        val headers = listOf("Time", "pH", "ppm", "Water Temp (°C)", "LIGHT (lx)", "Humidity", "Status")
        for (h in headers) {
            headerRow.addView(buildTableCell(h, isHeader = true, density = density))
        }
        sensorHistoryTable.addView(headerRow)

        val total = sensorHistoryData.size
        if (total == 0) {
            val emptyRow = TableRow(this)
            emptyRow.addView(TextView(this).apply {
                text = "Tidak ada data sensor terhubung (Status: Terputus / N/A)"
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_red))
                textSize = 12.5f
                setPadding((12 * density).toInt(), (18 * density).toInt(), (12 * density).toInt(), (18 * density).toInt())
                layoutParams = TableRow.LayoutParams().apply { span = 7 }
            })
            sensorHistoryTable.addView(emptyRow)
            sensorPageInfo.text = "Menampilkan 0 - 0 dari 0 data"
            sensorPaginationBtns.removeAllViews()
            return
        }

        val totalPages = ceil(total.toDouble() / sensorPerPage).toInt().coerceAtLeast(1)
        if (sensorCurrentPage > totalPages) sensorCurrentPage = totalPages
        val start = (sensorCurrentPage - 1) * sensorPerPage
        val end = min(start + sensorPerPage, total)
        sensorPageInfo.text = "Menampilkan ${start + 1} - $end dari $total data"

        for (i in start until end) {
            val r = sensorHistoryData[i]
            val row = TableRow(this)
            val isWarn = r.status.equals("warning", ignoreCase = true)
            row.addView(buildTableCell(r.time, false, density))
            row.addView(buildTableCell(r.ph, false, density))
            row.addView(buildTableCell(r.ppm, false, density))
            row.addView(buildTableCell(r.temp, false, density))
            row.addView(buildTableCell(r.light, false, density))
            row.addView(buildTableCell(r.hum, false, density))
            row.addView(
                buildTableCell(
                    r.status,
                    false,
                    density,
                    textColor = if (isWarn) 0xFFE65100.toInt() else ContextCompat.getColor(this, R.color.tefa_g5),
                    bold = true
                )
            )
            sensorHistoryTable.addView(row)
        }

        renderPaginationButtons(sensorPaginationBtns, sensorCurrentPage, totalPages) { page ->
            sensorCurrentPage = page
            renderSensorHistoryTable()
        }
    }

    private fun renderAwsHistoryTable() {
        val density = resources.displayMetrics.density
        awsHistoryTable.removeAllViews()

        val headerRow = TableRow(this).apply {
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_g1))
        }
        val headers = listOf("Time", "Air Temperature", "Humidity", "Solar Radiation & PAR")
        for (h in headers) {
            headerRow.addView(buildTableCell(h, isHeader = true, density = density))
        }
        awsHistoryTable.addView(headerRow)

        val list = awsHistoryMap[activeAwsTab].orEmpty()
        val total = list.size
        if (total == 0) {
            val emptyRow = TableRow(this)
            emptyRow.addView(TextView(this).apply {
                text = "Tidak ada data riwayat AWS (Sensor Terputus / N/A)"
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.tefa_red))
                textSize = 12.5f
                setPadding((12 * density).toInt(), (18 * density).toInt(), (12 * density).toInt(), (18 * density).toInt())
                layoutParams = TableRow.LayoutParams().apply { span = 4 }
            })
            awsHistoryTable.addView(emptyRow)
            awsPageInfo.text = "Menampilkan 0 - 0 dari 0 data"
            awsPaginationBtns.removeAllViews()
            return
        }

        val totalPages = ceil(total.toDouble() / awsPerPage).toInt().coerceAtLeast(1)
        if (awsCurrentPage > totalPages) awsCurrentPage = totalPages
        val start = (awsCurrentPage - 1) * awsPerPage
        val end = min(start + awsPerPage, total)
        awsPageInfo.text = "Menampilkan ${start + 1} - $end dari $total data"

        for (i in start until end) {
            val r = list[i]
            val row = TableRow(this)
            row.addView(buildTableCell(r.time, false, density))
            row.addView(buildTableCell(r.temp, false, density))
            row.addView(buildTableCell(r.hum, false, density))
            row.addView(buildTableCell(r.solar, false, density))
            awsHistoryTable.addView(row)
        }

        renderPaginationButtons(awsPaginationBtns, awsCurrentPage, totalPages) { page ->
            awsCurrentPage = page
            renderAwsHistoryTable()
        }
    }

    private fun buildTableCell(
        txt: String,
        isHeader: Boolean,
        density: Float,
        textColor: Int? = null,
        bold: Boolean = false
    ): TextView {
        return TextView(this).apply {
            text = txt
            setPadding((10 * density).toInt(), (9 * density).toInt(), (10 * density).toInt(), (9 * density).toInt())
            textSize = if (isHeader) 11.5f else 12f
            setTypeface(null, if (isHeader || bold) Typeface.BOLD else Typeface.NORMAL)
            setTextColor(
                textColor ?: ContextCompat.getColor(
                    this@MainActivity,
                    if (isHeader) R.color.tefa_g5 else R.color.tefa_g9
                )
            )
        }
    }

    private fun renderPaginationButtons(
        container: LinearLayout,
        currentPage: Int,
        totalPages: Int,
        onSelect: (Int) -> Unit
    ) {
        container.removeAllViews()
        val density = resources.displayMetrics.density

        fun makeBtn(label: String, active: Boolean, enabled: Boolean, onClick: (() -> Unit)?): TextView {
            return TextView(this).apply {
                text = label
                gravity = Gravity.CENTER
                minWidth = (32 * density).toInt()
                height = (32 * density).toInt()
                setPadding((10 * density).toInt(), 0, (10 * density).toInt(), 0)
                setBackgroundResource(if (active) R.drawable.bg_pill_chip_active else R.drawable.bg_pill_chip)
                setTextColor(ContextCompat.getColor(this@MainActivity, if (active) R.color.tefa_white else R.color.tefa_g9))
                alpha = if (enabled) 1f else 0.45f
                textSize = 12f
                setTypeface(null, Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    (32 * density).toInt()
                ).apply { marginEnd = (6 * density).toInt() }
                if (enabled && onClick != null) {
                    setOnClickListener { onClick() }
                }
            }
        }

        container.addView(makeBtn("‹", active = false, enabled = currentPage > 1) {
            onSelect(currentPage - 1)
        })
        val maxVis = 5
        val half = maxVis / 2
        var startP = max(1, currentPage - half)
        val endP = min(totalPages, startP + maxVis - 1)
        if (endP - startP < maxVis - 1) {
            startP = max(1, endP - maxVis + 1)
        }
        for (p in startP..endP) {
            container.addView(makeBtn(p.toString(), active = p == currentPage, enabled = true) {
                onSelect(p)
            })
        }
        container.addView(makeBtn("›", active = false, enabled = currentPage < totalPages) {
            onSelect(currentPage + 1)
        })
    }

    private fun setConnectionUi(stateText: String, subText: String, isOnline: Boolean) {
        hwEspVal.text = stateText
        hwEspSub.text = subText
        val colorVal = if (isOnline) Color.WHITE else 0xFFFCA5A5.toInt()
        hwEspVal.setTextColor(colorVal)
        hwEspSub.setTextColor(if (isOnline) ContextCompat.getColor(this, R.color.tefa_g3) else 0xFFFCA5A5.toInt())

        if (isOnline) {
            weatherDescText.text = "Broker terhubung · $subText"
            weatherDescText.setTextColor(ContextCompat.getColor(this, R.color.tefa_g5))
        } else {
            weatherDescText.text = subText
            weatherDescText.setTextColor(
                if (stateText == "Connecting") 0xFFE65100.toInt() else ContextCompat.getColor(this, R.color.tefa_red)
            )
        }
    }

    private fun handleIncomingDeviceStatus(status: DeviceStatusPayload) {
        lastDeviceStatus = status
        uptimeValue.text = "${TimeRangeAggregator.formatWibTime(status.timestamp)} WIB"
        hwEspVal.text = "Online"
        hwEspVal.setTextColor(Color.WHITE)
        if (!hwEspSub.text.startsWith("WiFi ")) {
            hwEspSub.text = status.deviceId
            hwEspSub.setTextColor(ContextCompat.getColor(this, R.color.tefa_g3))
        }
        renderHeroRelayStatus(status)
        syncAdminPumpsUi(status)
    }

    private fun renderHeroRelayStatus(status: DeviceStatusPayload) {
        val ps = status.pumpsStatus
        if (ps.isNotEmpty()) {
            val activeCount = ps.values.count { it.equals("ON", ignoreCase = true) }
            val onlyBigOn = activeCount == 1 && ps["pump_big"]?.equals("ON", ignoreCase = true) == true
            hwRelayVal.text = when {
                activeCount == 0 -> "Semua OFF"
                onlyBigOn -> "Pump Big ON"
                else -> "$activeCount/${ps.size} Pompa ON"
            }
        } else {
            hwRelayVal.text = "Terhubung"
        }
        hwRelayVal.setTextColor(Color.WHITE)
        hwRelaySub.text = status.activeIntervalMinutes?.let { "Interval $it mnt" } ?: status.statusMessage
        hwRelaySub.setTextColor(ContextCompat.getColor(this, R.color.tefa_g3))
    }

    private fun syncAdminPumpsUi(status: DeviceStatusPayload) {
        var settings = prefs.getSettings()
        var updated = false
        val parsedInt = status.activeIntervalMinutes
        if (parsedInt != null && parsedInt > 0) {
            settings = settings.copy(intervalMinutes = parsedInt.toString())
            updated = true
        }
        val ps = status.pumpsStatus
        if (ps.isNotEmpty()) {
            for (key in DashboardSettings.PUMP_KEYS) {
                val rawState = ps[key] ?: continue
                val norm = if (rawState.equals("on", ignoreCase = true)) "on" else "off"
                settings = settings.withPumpState(key, norm)
                updated = true
                val holder = relayHolders.firstOrNull { it.pumpKey == key }
                if (holder != null) {
                    updateRelayCardUi(holder, norm == "on", parsedInt)
                }
            }
        }
        if (updated) {
            prefs.saveSettings(settings)
        }
    }

    private fun handleIncomingTelemetry(payload: NormalizedTelemetry) {
        val thr = prefs.getSettings().parsedThresholds()
        val wibTime = TimeRangeAggregator.formatWibTime(payload.timestamp)

        val isPhWarn = payload.ph != null && (payload.ph < thr.phMin || payload.ph > thr.phMax)
        val isWaterWarn = payload.waterTemp != null && (payload.waterTemp < thr.tempMin || payload.waterTemp > thr.tempMax)
        val isHumWarn = payload.airHum != null && (payload.airHum < thr.humMin || payload.airHum > thr.humMax)
        val overallStatus = if (isPhWarn || isWaterWarn || isHumWarn) "Warning" else "Normal"

        // 1. Hero Uptime & Hardware Health
        uptimeValue.text = "$wibTime WIB"
        hwEspVal.text = "Online"
        hwEspVal.setTextColor(Color.WHITE)
        hwEspSub.setTextColor(ContextCompat.getColor(this, R.color.tefa_g3))
        if (payload.wifiRssi != null) {
            val valStr = if (payload.wifiUnit.equals("dbm", ignoreCase = true)) {
                String.format(Locale.US, "%.0f", payload.wifiRssi)
            } else {
                String.format(Locale.US, "%.1f", payload.wifiRssi)
            }
            hwEspSub.text = "WiFi $valStr ${payload.wifiUnit}"
        } else {
            hwEspSub.text = payload.deviceId
        }

        payload.ph?.let { ph ->
            hwPhVal.text = String.format(Locale.US, "%.2f pH", ph)
            hwPhVal.setTextColor(Color.WHITE)
            hwPhSub.text = if (isPhWarn) "Warning" else "Normal"
            hwPhSub.setTextColor(ContextCompat.getColor(this, R.color.tefa_g3))
        }
        payload.ec?.let { ec ->
            hwTdsVal.text = String.format(Locale.US, "%.2f %s", ec, payload.ecUnit)
            hwTdsVal.setTextColor(Color.WHITE)
            hwTdsSub.text = "Normal"
            hwTdsSub.setTextColor(ContextCompat.getColor(this, R.color.tefa_g3))
        }
        payload.light?.let { lx ->
            hwLightVal.text = String.format(Locale.US, "%.1f lx", lx)
            hwLightVal.setTextColor(Color.WHITE)
            hwLightSub.text = "Aktif"
            hwLightSub.setTextColor(ContextCompat.getColor(this, R.color.tefa_g3))
        }

        val devStatus = lastDeviceStatus
        if (devStatus != null) {
            renderHeroRelayStatus(devStatus)
        } else {
            hwRelayVal.text = payload.pompaStatus?.let { "Pompa ${it.uppercase(Locale.US)}" } ?: "Standby"
            hwRelayVal.setTextColor(Color.WHITE)
            hwRelaySub.text = payload.deepSleepSec?.let { "DeepSleep ${it}s" } ?: "Terhubung"
            hwRelaySub.setTextColor(ContextCompat.getColor(this, R.color.tefa_g3))
        }

        // 2. Air Temp & Time Card
        payload.airTemp?.let { at ->
            if (minAirTemp == null || at < minAirTemp!!) minAirTemp = at
            if (maxAirTemp == null || at > maxAirTemp!!) maxAirTemp = at
            weatherTempText.text = String.format(Locale.US, "%.1f°C", at)
            weatherTempText.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            weatherMinVal.text = String.format(Locale.US, "%.1f°C", minAirTemp)
            weatherMaxVal.text = String.format(Locale.US, "%.1f°C", maxAirTemp)
        }
        weatherDescText.text = "Terhubung · ${payload.deviceId}"
        weatherDescText.setTextColor(ContextCompat.getColor(this, R.color.tefa_g5))
        payload.airHum?.let { hum ->
            weatherHumVal.text = String.format(Locale.US, "%.1f%%", hum)
        }

        // 3. Sensor Cards
        payload.ph?.let { ph ->
            sensorPhVal.text = String.format(Locale.US, "%.2f", ph)
            sensorPhBar.progress = ((ph / 14.0) * 100.0).toInt().coerceIn(0, 100)
            sensorPhStatus.text = if (isPhWarn) "Warning" else "Optimal"
            sensorPhStatus.setTextColor(
                if (isPhWarn) 0xFFE65100.toInt() else ContextCompat.getColor(this, R.color.tefa_g5)
            )
        }
        payload.ec?.let { ec ->
            sensorTdsVal.text = String.format(Locale.US, "%.2f %s", ec, payload.ecUnit)
            sensorTdsBar.progress = ((ec / 3.0) * 100.0).toInt().coerceIn(5, 100)
            sensorTdsStatus.text = "Optimal"
            sensorTdsStatus.setTextColor(ContextCompat.getColor(this, R.color.tefa_g5))
        }
        payload.light?.let { lx ->
            sensorLightVal.text = String.format(Locale.US, "%.1f %s", lx, payload.lightUnit)
            sensorLightBar.progress = ((lx / 30000.0) * 100.0).toInt().coerceIn(5, 100)
            sensorLightStatus.text = if (lx > 200.0) "Terang" else "Redup"
            sensorLightStatus.setTextColor(ContextCompat.getColor(this, R.color.tefa_g5))
        }

        // 4. Water Temp Donut
        payload.waterTemp?.let { wt ->
            if (minWaterTemp == null || wt < minWaterTemp!!) minWaterTemp = wt
            if (maxWaterTemp == null || wt > maxWaterTemp!!) maxWaterTemp = wt
            waterTempDonut.setTemperature(wt)
            waterTempMin.text = String.format(Locale.US, "Min: %.1f°C", minWaterTemp)
            waterTempStatus.text = if (isWaterWarn) "Status: Warning" else "Status: Normal"
            waterTempStatus.setTextColor(
                if (isWaterWarn) 0xFFE65100.toInt() else ContextCompat.getColor(this, R.color.tefa_g5)
            )
            waterTempMax.text = String.format(Locale.US, "Max: %.1f°C", maxWaterTemp)
        }

        // 5. Threshold Monitor
        payload.ph?.let { ph ->
            thrPhVal.text = String.format(Locale.US, "%.2f pH", ph)
            thrPhVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            thrPhBar.progress = ((ph / 14.0) * 100.0).toInt().coerceIn(3, 100)
        }
        payload.ec?.let { ec ->
            thrTdsVal.text = String.format(Locale.US, "%.2f mS/cm", ec)
            thrTdsVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            thrTdsBar.progress = ((ec / 3.0) * 100.0).toInt().coerceIn(3, 100)
        }
        payload.waterTemp?.let { wt ->
            thrWtVal.text = String.format(Locale.US, "%.1f °C", wt)
            thrWtVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            thrWtBar.progress = ((wt / 50.0) * 100.0).toInt().coerceIn(3, 100)
        }
        payload.airHum?.let { hum ->
            thrHumVal.text = String.format(Locale.US, "%.1f %%", hum)
            thrHumVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            thrHumBar.progress = hum.toInt().coerceIn(3, 100)
        }
        payload.light?.let { lx ->
            thrLightVal.text = String.format(Locale.US, "%.1f lx", lx)
            thrLightVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            thrLightBar.progress = ((lx / 30000.0) * 100.0).toInt().coerceIn(3, 100)
        }

        lastTelemetrySummary = TelemetrySummarySnapshot(
            sensorsSummary = listOfNotNull(
                payload.ph?.let { String.format(Locale.US, "PH: %.2f (%s)", it, sensorPhStatus.text) },
                payload.ec?.let { String.format(Locale.US, "NUTRITION: %.2f %s", it, payload.ecUnit) },
                payload.light?.let { String.format(Locale.US, "LIGHT: %.1f %s", it, payload.lightUnit) }
            ).joinToString(", ").ifBlank { "pH, Nutrisi, Cahaya N/A" },
            weatherTemp = weatherTempText.text.toString(),
            weatherDesc = weatherDescText.text.toString(),
            waterTemp = payload.waterTemp?.let { String.format(Locale.US, "%.1f°", it) } ?: "N/A"
        )

        // 6. Telemetry Log & Chart
        val entryTs = TimeRangeAggregator.parseIsoTimestampMillis(payload.timestamp) ?: System.currentTimeMillis()
        val logPoint = TelemetryLogPoint(
            ts = entryTs,
            time = wibTime,
            ph = payload.ph ?: 0.0,
            ec = payload.ec ?: 0.0,
            waterTemp = payload.waterTemp ?: 0.0,
            airTemp = payload.airTemp ?: 0.0,
            airHum = payload.airHum,
            light = payload.light ?: 0.0
        )
        telemetryHistory.add(logPoint)
        if (telemetryHistory.size > 15) telemetryHistory.removeAt(0)

        telemetryLog.add(logPoint)
        if (telemetryLog.size > 2000) telemetryLog.removeAt(0)
        prefs.saveTelemetryLog(telemetryLog)
        renderTelemetryChart()

        // 7. History Table & Notifications
        sensorHistoryData.add(
            0,
            SensorHistoryRow(
                time = wibTime,
                ph = payload.ph?.let { String.format(Locale.US, "%.2f", it) } ?: "N/A",
                ppm = payload.ec?.let { String.format(Locale.US, "%.2f mS/cm", it) } ?: "N/A",
                temp = payload.waterTemp?.let { String.format(Locale.US, "%.1f", it) } ?: "N/A",
                light = payload.light?.let { String.format(Locale.US, "%.1f", it) } ?: "N/A",
                hum = payload.airHum?.let { String.format(Locale.US, "%.1f%%", it) } ?: "N/A",
                status = overallStatus
            )
        )
        if (sensorHistoryData.size > 200) sensorHistoryData.removeAt(sensorHistoryData.lastIndex)
        renderSensorHistoryTable()

        val liveNotif = NotificationBuilder.buildSensorNotificationItem(
            phVal = payload.ph,
            ecVal = payload.ec,
            wtVal = payload.waterTemp,
            humVal = payload.airHum,
            thr = thr,
            timeText = "$wibTime WIB",
            forceWarn = overallStatus == "Warning"
        )
        if (liveNotif.type == "warning" || lastNotifStatus != "normal") {
            notificationsList.add(0, liveNotif)
            if (notificationsList.size > 50) notificationsList.removeAt(notificationsList.lastIndex)
            if (liveNotif.type == "warning") {
                unreadNotifCount++
                updateNotifBadge()
            }
            notifDialog?.refreshIfShowing()
        }
        lastNotifStatus = liveNotif.type

        // 8. AWS Cards & History
        if (payload.airTemp != null || payload.airHum != null) {
            awsAirBadge.text = "Online"
            awsAirBadge.setBackgroundResource(R.drawable.bg_badge_online)
            awsAirBadge.setTextColor(ContextCompat.getColor(this, R.color.tefa_g5))
            payload.airTemp?.let {
                awsAirTempVal.text = String.format(Locale.US, "%.1f °C", it)
                awsAirTempVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            }
            payload.airHum?.let {
                awsAirHumVal.text = String.format(Locale.US, "%.1f %%", it)
                awsAirHumVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            }
            awsAirBars.setBars(telemetryHistory.map { it.airTemp.toFloat() }, 50f)
            awsAirCap.text = "Data tren suhu udara · Live dari AHT20"
        }

        payload.light?.let { lx ->
            awsLuxBadge.text = "Online"
            awsLuxBadge.setBackgroundResource(R.drawable.bg_badge_online)
            awsLuxBadge.setTextColor(ContextCompat.getColor(this, R.color.tefa_g5))
            awsSolarVal.text = String.format(Locale.US, "%.1f W/m²", lx * 0.0079)
            awsSolarVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            awsParVal.text = String.format(Locale.US, "%.1f µmol/m²/s", lx * 0.0185)
            awsParVal.setTextColor(ContextCompat.getColor(this, R.color.tefa_ink))
            awsLuxBars.setBars(telemetryHistory.map { it.light.toFloat() }, 30000f)
            awsLuxCap.text = "Estimasi dari BH1750 (${lx.toInt()} lux)"
        }

        val solarTxt = payload.light?.let {
            String.format(Locale.US, "%.1f W/m² · %.0f PAR", it * 0.0079, it * 0.0185)
        } ?: "-"
        val dailyList = awsHistoryMap["daily"] ?: mutableListOf()
        dailyList.add(
            0,
            AwsHistoryRow(
                time = "$wibTime WIB",
                temp = payload.airTemp?.let { String.format(Locale.US, "%.1f °C", it) } ?: "-",
                hum = payload.airHum?.let { String.format(Locale.US, "%.1f%%", it) } ?: "-",
                solar = solarTxt
            )
        )
        if (dailyList.size > 200) dailyList.removeAt(dailyList.lastIndex)
        awsHistoryMap["daily"] = dailyList
        syncAwsHistoryTablesFromLog(includeDaily = false)

        // 9. Persist to Supabase
        uiScope.launch {
            SupabaseClient.saveTelemetry(payload, thr)
        }
    }

    private fun syncAwsHistoryTablesFromLog(includeDaily: Boolean) {
        val (daily, weekly, monthly) = SupabaseClient.buildAwsAggregationsFromTelemetryLog(telemetryLog)
        if (includeDaily) awsHistoryMap["daily"] = daily.toMutableList()
        awsHistoryMap["weekly"] = weekly.toMutableList()
        awsHistoryMap["monthly"] = monthly.toMutableList()
        renderAwsHistoryTable()
    }

    private fun loadHistoryFromSupabase() {
        uiScope.launch {
            val thr = prefs.getSettings().parsedThresholds()
            val bundle = SupabaseClient.fetchHistory(thr) ?: return@launch
            withContext(Dispatchers.Main) {
                if (bundle.sensorHistoryRows.isNotEmpty() || sensorHistoryData.isEmpty()) {
                    sensorHistoryData = bundle.sensorHistoryRows.toMutableList()
                    sensorCurrentPage = 1
                    renderSensorHistoryTable()
                }
                if (bundle.notifications.isNotEmpty()) {
                    notificationsList.clear()
                    notificationsList.addAll(bundle.notifications)
                    unreadNotifCount = bundle.notifications.count { it.type == "warning" }
                    updateNotifBadge()
                    notifDialog?.refreshIfShowing()
                }
                if (bundle.awsDailyRows.isNotEmpty() || bundle.awsWeeklyRows.isNotEmpty() || bundle.awsMonthlyRows.isNotEmpty()) {
                    awsHistoryMap["daily"] = bundle.awsDailyRows.toMutableList()
                    awsHistoryMap["weekly"] = bundle.awsWeeklyRows.toMutableList()
                    awsHistoryMap["monthly"] = bundle.awsMonthlyRows.toMutableList()
                    renderAwsHistoryTable()
                }
                if (bundle.telemetryLog.isNotEmpty()) {
                    telemetryLog = bundle.telemetryLog.toMutableList()
                    prefs.saveTelemetryLog(telemetryLog)
                    renderTelemetryChart()
                    if (telemetryHistory.isEmpty()) {
                        telemetryHistory.addAll(telemetryLog.takeLast(15))
                    }
                }
            }
        }
    }

    private fun updateNotifBadge() {
        if (unreadNotifCount > 0) {
            notifBadge.text = if (unreadNotifCount > 99) "99+" else unreadNotifCount.toString()
            notifBadge.visibility = View.VISIBLE
        } else {
            notifBadge.visibility = View.GONE
        }
    }

    private fun fmtTime(s: Int): String {
        val h = s / 3600
        val m = (s % 3600) / 60
        val sec = s % 60
        return String.format(Locale.US, "%02d:%02d:%02d", h, m, sec)
    }
}