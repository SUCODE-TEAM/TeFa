package id.tefa.smartgreenhouse.ui.dialog

import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import id.tefa.smartgreenhouse.R
import id.tefa.smartgreenhouse.model.SensorNotification
import kotlin.math.ceil
import kotlin.math.min

class NotificationDialog(
    private val context: Context,
    private val getNotifications: () -> List<SensorNotification>
) {
    private var dialog: Dialog? = null
    private var currentFilter = "all"
    private var currentPage = 1
    private val perPage = 3

    private lateinit var tabAll: TextView
    private lateinit var tabWarning: TextView
    private lateinit var tabNormal: TextView
    private lateinit var listContainer: LinearLayout
    private lateinit var paginationRow: LinearLayout
    private lateinit var paginationInfo: TextView
    private lateinit var prevBtn: MaterialButton
    private lateinit var nextBtn: MaterialButton

    fun show() {
        val d = Dialog(context)
        d.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val view = LayoutInflater.from(context).inflate(R.layout.dialog_notifications, null)
        d.setContentView(view)
        d.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(
                (context.resources.displayMetrics.widthPixels * 0.94).toInt(),
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        tabAll = view.findViewById(R.id.tabNotifAll)
        tabWarning = view.findViewById(R.id.tabNotifWarning)
        tabNormal = view.findViewById(R.id.tabNotifNormal)
        listContainer = view.findViewById(R.id.notifListContainer)
        paginationRow = view.findViewById(R.id.notifPagination)
        paginationInfo = view.findViewById(R.id.notifPaginationInfo)
        prevBtn = view.findViewById(R.id.notifPrevBtn)
        nextBtn = view.findViewById(R.id.notifNextBtn)

        view.findViewById<ImageButton>(R.id.notifBtnClose).setOnClickListener { d.dismiss() }

        tabAll.setOnClickListener { selectFilter("all") }
        tabWarning.setOnClickListener { selectFilter("warning") }
        tabNormal.setOnClickListener { selectFilter("normal") }

        prevBtn.setOnClickListener {
            if (currentPage > 1) {
                currentPage--
                renderList()
            }
        }
        nextBtn.setOnClickListener {
            val totalPages = totalPagesFor(filteredList().size)
            if (currentPage < totalPages) {
                currentPage++
                renderList()
            }
        }

        currentPage = 1
        renderTabs()
        renderList()

        dialog = d
        d.show()
    }

    fun refreshIfShowing() {
        if (dialog?.isShowing == true) {
            renderList()
        }
    }

    private fun selectFilter(filter: String) {
        currentFilter = filter
        currentPage = 1
        renderTabs()
        renderList()
    }

    private fun renderTabs() {
        val pairs = listOf(tabAll to "all", tabWarning to "warning", tabNormal to "normal")
        for ((tv, key) in pairs) {
            val active = key == currentFilter
            tv.setBackgroundResource(if (active) R.drawable.bg_pill_chip_active else R.drawable.bg_pill_chip)
            tv.setTextColor(
                ContextCompat.getColor(context, if (active) R.color.tefa_white else R.color.tefa_g9)
            )
        }
    }

    private fun filteredList(): List<SensorNotification> {
        val all = getNotifications()
        return if (currentFilter == "all") all else all.filter { it.type == currentFilter }
    }

    private fun totalPagesFor(total: Int): Int {
        return ceil(total.toDouble() / perPage).toInt().coerceAtLeast(1)
    }

    private fun renderList() {
        listContainer.removeAllViews()
        val filtered = filteredList()
        val total = filtered.size
        val totalPages = totalPagesFor(total)
        if (currentPage > totalPages) currentPage = totalPages
        if (currentPage < 1) currentPage = 1

        paginationInfo.text = "Halaman $currentPage dari $totalPages ($total notifikasi)"
        prevBtn.isEnabled = currentPage > 1
        nextBtn.isEnabled = currentPage < totalPages && total > 0

        if (total == 0) {
            paginationRow.visibility = View.GONE
            listContainer.addView(buildEmptyView())
            return
        }

        paginationRow.visibility = View.VISIBLE
        val start = (currentPage - 1) * perPage
        val end = min(start + perPage, total)
        for (i in start until end) {
            listContainer.addView(buildNotificationCard(filtered[i]))
        }
    }

    private fun buildEmptyView(): View {
        val density = context.resources.displayMetrics.density
        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding((16 * density).toInt(), (28 * density).toInt(), (16 * density).toInt(), (28 * density).toInt())

            addView(ImageView(context).apply {
                setImageResource(R.drawable.ic_bell)
                setColorFilter(ContextCompat.getColor(context, R.color.tefa_mute))
                layoutParams = LinearLayout.LayoutParams((36 * density).toInt(), (36 * density).toInt())
            })
            addView(TextView(context).apply {
                text = "Tidak Ada Notifikasi"
                setTextColor(ContextCompat.getColor(context, R.color.tefa_g9))
                textSize = 15f
                setTypeface(null, Typeface.BOLD)
                setPadding(0, (10 * density).toInt(), 0, (4 * density).toInt())
            })
            addView(TextView(context).apply {
                text = "Saat ini tidak ada pemberitahuan atau peringatan baru dari sensor."
                setTextColor(ContextCompat.getColor(context, R.color.tefa_mute))
                textSize = 12.5f
                gravity = Gravity.CENTER
            })
        }
    }

    private fun buildNotificationCard(item: SensorNotification): View {
        val density = context.resources.displayMetrics.density
        val isWarning = item.type == "warning"

        val bg = GradientDrawable().apply {
            cornerRadius = 12f * density
            setColor(if (isWarning) 0xFFFFF8F2.toInt() else 0xFFF7FBF8.toInt())
            setStroke((1.2f * density).toInt(), if (isWarning) 0xFFF6C6A5.toInt() else 0xFFD8E2DC.toInt())
        }

        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = bg
            val lp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = (10 * density).toInt()
            layoutParams = lp
            setPadding((14 * density).toInt(), (12 * density).toInt(), (14 * density).toInt(), (12 * density).toInt())
        }

        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val tagBg = GradientDrawable().apply {
            cornerRadius = 99f * density
            setColor(if (isWarning) 0xFFFFE4D2.toInt() else 0xFFE8F5E9.toInt())
        }
        header.addView(TextView(context).apply {
            text = item.tag
            background = tagBg
            setTextColor(if (isWarning) 0xFFE65100.toInt() else 0xFF1B4332.toInt())
            textSize = 10.5f
            setTypeface(null, Typeface.BOLD)
            setPadding((8 * density).toInt(), (3 * density).toInt(), (8 * density).toInt(), (3 * density).toInt())
        })
        header.addView(View(context).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        })
        header.addView(TextView(context).apply {
            text = item.time
            setTextColor(ContextCompat.getColor(context, R.color.tefa_mute))
            textSize = 11f
        })
        card.addView(header)

        card.addView(TextView(context).apply {
            text = item.title
            setTextColor(ContextCompat.getColor(context, R.color.tefa_g9))
            textSize = 13.5f
            setTypeface(null, Typeface.BOLD)
            setPadding(0, (6 * density).toInt(), 0, (3 * density).toInt())
        })
        card.addView(TextView(context).apply {
            text = item.desc
            setTextColor(ContextCompat.getColor(context, R.color.tefa_mute))
            textSize = 12f
        })
        card.addView(View(context).apply {
            setBackgroundColor(ContextCompat.getColor(context, R.color.tefa_g1))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (1 * density).toInt()).apply {
                topMargin = (8 * density).toInt()
                bottomMargin = (6 * density).toInt()
            }
        })
        card.addView(TextView(context).apply {
            text = item.value
            setTextColor(ContextCompat.getColor(context, R.color.tefa_g5))
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
        })

        return card
    }
}
