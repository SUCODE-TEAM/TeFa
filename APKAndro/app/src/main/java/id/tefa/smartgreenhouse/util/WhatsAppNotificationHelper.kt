package id.tefa.smartgreenhouse.util

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import id.tefa.smartgreenhouse.R
import id.tefa.smartgreenhouse.ui.MainActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicInteger

object WhatsAppNotificationHelper {

    const val CHANNEL_ALERTS_HIGH = "tefa_whatsapp_alerts_high"
    const val CHANNEL_UPDATES_INFO = "tefa_updates_info"
    private const val GROUP_KEY_ALERTS = "id.tefa.smartgreenhouse.SENSOR_ALERTS"

    private val notifCounter = AtomicInteger(2000)
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile
    private var pendingTestRunnable: Runnable? = null
    @Volatile
    private var lastAlertSignature: String = ""
    @Volatile
    private var lastAlertTimeMs: Long = 0L

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        if (nm.getNotificationChannel(CHANNEL_ALERTS_HIGH) == null) {
            val highChannel = NotificationChannel(
                CHANNEL_ALERTS_HIGH,
                "Peringatan Sensor TeFa (Pop-up)",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifikasi pop-up penting saat pH, EC, suhu, atau kelembapan melewati batas aman."
                enableLights(true)
                lightColor = 0xFF1B4332.toInt()
                enableVibration(true)
                vibrationPattern = longArrayOf(0L, 260L, 130L, 260L)
                setSound(soundUri, audioAttrs)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setShowBadge(true)
            }
            nm.createNotificationChannel(highChannel)
        }

        if (nm.getNotificationChannel(CHANNEL_UPDATES_INFO) == null) {
            val infoChannel = NotificationChannel(
                CHANNEL_UPDATES_INFO,
                "Info Sistem TeFa",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Pembaruan status normal dan hasil ekspor data CSV."
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setShowBadge(false)
            }
            nm.createNotificationChannel(infoChannel)
        }
    }

    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    fun showSensorNotification(
        context: Context,
        title: String,
        desc: String,
        valueSummary: String,
        isWarning: Boolean,
        timeText: String = "",
        bypassThrottle: Boolean = false
    ) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return

        val cleanTitle = title.ifBlank {
            if (isWarning) "Peringatan Parameter Sensor" else "Kondisi Sensor Normal"
        }
        val cleanDesc = desc.ifBlank { "Pembaruan status sensor TeFa Smart Greenhouse." }
        val fullBody = buildString {
            append(cleanDesc)
            if (valueSummary.isNotBlank()) {
                append("\n")
                append(valueSummary)
            }
            if (timeText.isNotBlank()) {
                append("\nWaktu: ")
                append(timeText)
            }
        }

        val now = System.currentTimeMillis()
        val sig = "$isWarning|$cleanTitle|$cleanDesc|$valueSummary"
        if (!bypassThrottle && sig == lastAlertSignature && (now - lastAlertTimeMs) < 5_000L) {
            return
        }
        lastAlertSignature = sig
        lastAlertTimeMs = now

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("open_notifications", true)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val channelId = if (isWarning) CHANNEL_ALERTS_HIGH else CHANNEL_UPDATES_INFO
        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_bell)
            .setColor(if (isWarning) 0xFFBC2225.toInt() else 0xFF1B4332.toInt())
            .setContentTitle(cleanTitle)
            .setContentText(cleanDesc)
            .setSubText(if (isWarning) "Peringatan Sensor" else "Info Sensor")
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .setBigContentTitle(cleanTitle)
                    .bigText(fullBody)
            )
            .setPriority(if (isWarning) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setWhen(now)
            .setShowWhen(true)
            .setGroup(GROUP_KEY_ALERTS)
            .setContentIntent(pendingIntent)

        if (isWarning) {
            builder
                .setSound(soundUri)
                .setVibrate(longArrayOf(0L, 260L, 130L, 260L))
                .setDefaults(NotificationCompat.DEFAULT_ALL)
        }

        try {
            NotificationManagerCompat.from(context).notify(
                notifCounter.incrementAndGet(),
                builder.build()
            )
        } catch (_: SecurityException) {
        }
    }

    fun showCsvSavedNotification(context: Context, filename: String, rowCount: Int) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS_HIGH)
            .setSmallIcon(R.drawable.ic_bell)
            .setColor(0xFF1B4332.toInt())
            .setContentTitle("Ekspor CSV Selesai")
            .setContentText("$filename ($rowCount data sensor tersimpan)")
            .setSubText("TeFa Smart Greenhouse")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(notifCounter.incrementAndGet(), notification)
        } catch (_: SecurityException) {
        }
    }

    fun scheduleTestNotification(
        context: Context,
        delayMs: Long = 3_000L,
        title: String = "Test Notifikasi TeFa Greenhouse",
        desc: String = "Notifikasi uji berhasil masuk ke bar HP (delay 3 detik). Sistem peringatan sensor siap digunakan.",
        valueSummary: String = "pH: 6.20 · EC: 1.65 mS/cm · Air: 25.4°C",
        timeText: String = ""
    ) {
        val appContext = context.applicationContext
        ensureChannels(appContext)
        pendingTestRunnable?.let { mainHandler.removeCallbacks(it) }

        val safeDelay = delayMs.coerceIn(500L, 15_000L)
        val runnable = Runnable {
            pendingTestRunnable = null
            val resolvedTime = timeText.ifBlank {
                val fmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).apply {
                    timeZone = TimeZone.getTimeZone("Asia/Jakarta")
                }
                fmt.format(Date()) + " WIB"
            }
            showSensorNotification(
                context = appContext,
                title = title,
                desc = desc,
                valueSummary = valueSummary,
                isWarning = true,
                timeText = resolvedTime,
                bypassThrottle = true
            )
        }
        pendingTestRunnable = runnable
        mainHandler.postDelayed(runnable, safeDelay)
    }

    fun clearAllNotifications(context: Context) {
        pendingTestRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingTestRunnable = null
        try {
            NotificationManagerCompat.from(context).cancelAll()
        } catch (_: SecurityException) {
        }
        lastAlertSignature = ""
        lastAlertTimeMs = 0L
    }
}
