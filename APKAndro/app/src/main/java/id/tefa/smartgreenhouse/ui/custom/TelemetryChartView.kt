package id.tefa.smartgreenhouse.ui.custom

import android.content.Context
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import id.tefa.smartgreenhouse.model.ChartPoint
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class TelemetryChartView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var points: List<ChartPoint> = emptyList()
    private var showEc = true
    private var showPh = true
    private var showTemp = true
    private var hoverIdx = -1

    private var ecCoords: List<PointF> = emptyList()
    private var phCoords: List<PointF> = emptyList()
    private var tempCoords: List<PointF> = emptyList()

    private val density = resources.displayMetrics.density

    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1f * density
        color = 0xFFEBF0ED.toInt()
    }

    private val emptyDashPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1.5f * density
        color = 0xFF6B9080.toInt()
        pathEffect = DashPathEffect(floatArrayOf(6f * density, 5f * density), 0f)
    }

    private val yLabelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF4A5D52.toInt()
        textSize = 10.5f * density
        textAlign = Paint.Align.RIGHT
    }

    private val xLabelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF4A5D52.toInt()
        textSize = 10.5f * density
    }

    private val areaPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val ecLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.6f * density
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = 0xFF0D2818.toInt()
    }

    private val phLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.6f * density
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = 0xFF1B4332.toInt()
    }

    private val tempLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.6f * density
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = 0xFF6B9080.toInt()
    }

    private val crosshairPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1.4f * density
        color = 0x730D2818
        pathEffect = DashPathEffect(floatArrayOf(4f * density, 4f * density), 0f)
    }

    private val dotFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val dotBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * density
        color = 0xFFFFFFFF.toInt()
    }

    private val emptyPillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = 0xFFF8FAF9.toInt()
    }

    private val emptyPillStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1f * density
        color = 0xFFD8E2DC.toInt()
    }

    private val emptyTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF4A5D52.toInt()
        textSize = 12f * density
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
    }

    private val tooltipBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = 0xF7FFFFFF.toInt()
        setShadowLayer(10f * density, 0f, 3f * density, 0x300D2818)
    }

    private val tooltipDividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFEBF0ED.toInt()
        strokeWidth = 1f * density
    }

    private val tooltipTimePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF0D2818.toInt()
        textSize = 10.5f * density
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private val tooltipLabelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF4A5D52.toInt()
        textSize = 11f * density
    }

    private val tooltipValPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF0D2818.toInt()
        textSize = 11f * density
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.RIGHT
    }

    private val pathEc = Path()
    private val pathArea = Path()
    private val pathPh = Path()
    private val pathTemp = Path()

    init {
        setLayerType(LAYER_TYPE_SOFTWARE, null)
    }

    fun setData(pts: List<ChartPoint>, ecVisible: Boolean, phVisible: Boolean, tempVisible: Boolean) {
        points = pts
        showEc = ecVisible
        showPh = phVisible
        showTemp = tempVisible
        if (hoverIdx >= pts.size) hoverIdx = -1
        invalidate()
    }

    fun setVisibleSeries(ecVisible: Boolean, phVisible: Boolean, tempVisible: Boolean) {
        showEc = ecVisible
        showPh = phVisible
        showTemp = tempVisible
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desiredH = (220 * density).toInt()
        val w = resolveSize((360 * density).toInt(), widthMeasureSpec)
        val h = resolveSize(desiredH, heightMeasureSpec)
        setMeasuredDimension(w, h)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (points.isEmpty()) return super.onTouchEvent(event)
        val leftPad = 34f * density
        val rightPad = 12f * density
        val plotW = width - leftPad - rightPad
        if (plotW <= 0f) return false

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                val rel = ((event.x - leftPad) / plotW).coerceIn(0f, 1f)
                val n = points.size
                hoverIdx = if (n == 1) 0 else (rel * (n - 1)).roundToInt().coerceIn(0, n - 1)
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                hoverIdx = -1
                invalidate()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val leftPad = 34f * density
        val rightPad = 12f * density
        val topPad = 12f * density
        val bottomPad = 26f * density
        val plotW = (w - leftPad - rightPad).coerceAtLeast(10f)
        val plotH = (h - topPad - bottomPad).coerceAtLeast(10f)

        val yLabels = listOf("100", "75", "50", "25", "")
        for (i in yLabels.indices) {
            val y = topPad + (i / 4f) * plotH
            canvas.drawLine(leftPad, y, leftPad + plotW, y, gridPaint)
            if (yLabels[i].isNotEmpty()) {
                canvas.drawText(yLabels[i], leftPad - 6f * density, y + 4f * density, yLabelPaint)
            }
        }

        if (points.isEmpty()) {
            val baseY = topPad + plotH
            canvas.drawLine(leftPad, baseY, leftPad + plotW, baseY, emptyDashPaint)

            val defaultLabels = listOf("00:00", "06:00", "12:00", "18:00", "24:00")
            for (i in defaultLabels.indices) {
                val x = leftPad + (i / 4f) * plotW
                xLabelPaint.textAlign = when (i) {
                    0 -> Paint.Align.LEFT
                    4 -> Paint.Align.RIGHT
                    else -> Paint.Align.CENTER
                }
                canvas.drawText(defaultLabels[i], x, h - 6f * density, xLabelPaint)
            }

            val msg = "Sensor Terputus · Tidak Ada Data Telemetri (N/A)"
            val textW = emptyTextPaint.measureText(msg)
            val pillW = min(plotW - 16f * density, textW + 28f * density)
            val pillH = 34f * density
            val cx = leftPad + plotW / 2f
            val cy = topPad + plotH / 2f
            val pillRect = RectF(cx - pillW / 2f, cy - pillH / 2f, cx + pillW / 2f, cy + pillH / 2f)
            canvas.drawRoundRect(pillRect, 99f * density, 99f * density, emptyPillPaint)
            canvas.drawRoundRect(pillRect, 99f * density, 99f * density, emptyPillStrokePaint)
            canvas.drawText(msg, cx, cy + 4f * density, emptyTextPaint)
            return
        }

        val n = points.size
        fun mapSeries(getter: (ChartPoint) -> Double, maxVal: Double): List<PointF> {
            return points.mapIndexed { idx, pt ->
                val x = if (n == 1) leftPad + plotW / 2f else leftPad + (idx.toFloat() / (n - 1)) * plotW
                val ratio = (getter(pt) / maxVal).coerceIn(0.0, 1.0).toFloat()
                val y = topPad + plotH - 8f * density - ratio * max(10f, plotH - 20f * density)
                PointF(x, y)
            }
        }

        ecCoords = mapSeries({ it.ec * 33.0 }, 100.0)
        phCoords = mapSeries({ it.ph * 7.0 }, 100.0)
        tempCoords = mapSeries({ it.waterTemp }, 50.0)

        areaPaint.shader = LinearGradient(
            0f,
            topPad,
            0f,
            topPad + plotH,
            0x3D0D2818,
            0x000D2818,
            Shader.TileMode.CLAMP
        )

        if (showEc) {
            buildSmoothPath(ecCoords, topPad, topPad + plotH, false, pathEc)
            buildSmoothPath(ecCoords, topPad, topPad + plotH, true, pathArea)
            canvas.drawPath(pathArea, areaPaint)
        }
        if (showTemp) {
            buildSmoothPath(tempCoords, topPad, topPad + plotH, false, pathTemp)
            canvas.drawPath(pathTemp, tempLinePaint)
        }
        if (showPh) {
            buildSmoothPath(phCoords, topPad, topPad + plotH, false, pathPh)
            canvas.drawPath(pathPh, phLinePaint)
        }
        if (showEc) {
            canvas.drawPath(pathEc, ecLinePaint)
        }

        // X-axis labels
        val indices = if (n == 1) {
            listOf(0)
        } else if (n <= 5) {
            (0 until n).toList()
        } else {
            listOf(
                0,
                ((n - 1) * 0.25).roundToInt(),
                ((n - 1) * 0.5).roundToInt(),
                ((n - 1) * 0.75).roundToInt(),
                n - 1
            ).distinct()
        }

        for (idx in indices) {
            val pt = points[idx]
            val x = if (n == 1) leftPad + plotW / 2f else leftPad + (idx.toFloat() / (n - 1)) * plotW
            xLabelPaint.textAlign = when {
                n == 1 -> Paint.Align.CENTER
                idx == 0 -> Paint.Align.LEFT
                idx == n - 1 -> Paint.Align.RIGHT
                else -> Paint.Align.CENTER
            }
            canvas.drawText(pt.axisLabel, x, h - 6f * density, xLabelPaint)
        }

        // Hover crosshair, dots, and tooltip
        if (hoverIdx in points.indices) {
            val pt = points[hoverIdx]
            val pEc = ecCoords[hoverIdx]
            val pPh = phCoords[hoverIdx]
            val pTemp = tempCoords[hoverIdx]

            canvas.drawLine(pEc.x, topPad, pEc.x, topPad + plotH, crosshairPaint)

            val dotR = 4.5f * density
            if (showTemp) {
                dotFillPaint.color = 0xFF6B9080.toInt()
                canvas.drawCircle(pTemp.x, pTemp.y, dotR, dotFillPaint)
                canvas.drawCircle(pTemp.x, pTemp.y, dotR, dotBorderPaint)
            }
            if (showPh) {
                dotFillPaint.color = 0xFF1B4332.toInt()
                canvas.drawCircle(pPh.x, pPh.y, dotR, dotFillPaint)
                canvas.drawCircle(pPh.x, pPh.y, dotR, dotBorderPaint)
            }
            if (showEc) {
                dotFillPaint.color = 0xFF0D2818.toInt()
                canvas.drawCircle(pEc.x, pEc.y, dotR, dotFillPaint)
                canvas.drawCircle(pEc.x, pEc.y, dotR, dotBorderPaint)
            }

            drawTooltip(canvas, pt, pEc.x, topPad, leftPad, leftPad + plotW, topPad + plotH)
        }
    }

    private fun drawTooltip(
        canvas: Canvas,
        pt: ChartPoint,
        anchorX: Float,
        topPad: Float,
        minX: Float,
        maxX: Float,
        maxY: Float
    ) {
        val rows = mutableListOf<Triple<Int, String, String>>()
        if (showEc) {
            rows.add(Triple(0xFF0D2818.toInt(), "EC / TDS", String.format(Locale.US, "%.2f mS/cm", pt.ec)))
        }
        if (showPh) {
            rows.add(Triple(0xFF1B4332.toInt(), "pH", String.format(Locale.US, "%.2f pH", pt.ph)))
        }
        if (showTemp) {
            rows.add(Triple(0xFF6B9080.toInt(), "Water Temp", String.format(Locale.US, "%.1f °C", pt.waterTemp)))
        }

        val tipW = 166f * density
        val rowH = 18f * density
        val tipH = 34f * density + rows.size * rowH
        var tipLeft = anchorX + 12f * density
        if (tipLeft + tipW > maxX - 4f * density) {
            tipLeft = anchorX - tipW - 12f * density
        }
        tipLeft = tipLeft.coerceIn(minX + 4f * density, max(minX + 4f * density, maxX - tipW - 4f * density))
        val tipTop = (topPad + 8f * density).coerceAtMost(max(topPad, maxY - tipH - 6f * density))

        val rect = RectF(tipLeft, tipTop, tipLeft + tipW, tipTop + tipH)
        canvas.drawRoundRect(rect, 10f * density, 10f * density, tooltipBgPaint)

        val padX = 11f * density
        var curY = tipTop + 17f * density
        canvas.drawText("${pt.time} WIB", tipLeft + padX, curY, tooltipTimePaint)
        curY += 6f * density
        canvas.drawLine(tipLeft + padX, curY, tipLeft + tipW - padX, curY, tooltipDividerPaint)
        curY += 15f * density

        for ((color, label, valStr) in rows) {
            dotFillPaint.color = color
            canvas.drawCircle(tipLeft + padX + 4f * density, curY - 3.5f * density, 3.5f * density, dotFillPaint)
            canvas.drawText(label, tipLeft + padX + 12f * density, curY, tooltipLabelPaint)
            canvas.drawText(valStr, tipLeft + tipW - padX, curY, tooltipValPaint)
            curY += rowH
        }
    }

    private fun buildSmoothPath(
        pts: List<PointF>,
        minY: Float,
        bottomY: Float,
        closeArea: Boolean,
        outPath: Path
    ) {
        outPath.reset()
        if (pts.isEmpty()) return
        if (pts.size == 1) {
            val y = pts[0].y
            outPath.moveTo(0f, y)
            outPath.lineTo(width.toFloat(), y)
            if (closeArea) {
                outPath.lineTo(width.toFloat(), bottomY)
                outPath.lineTo(0f, bottomY)
                outPath.close()
            }
            return
        }

        outPath.moveTo(pts[0].x, pts[0].y)
        val clampMin = minY + 4f * density
        val clampMax = bottomY - 4f * density
        for (i in 0 until pts.size - 1) {
            val p0 = pts[max(0, i - 1)]
            val p1 = pts[i]
            val p2 = pts[i + 1]
            val p3 = pts[min(pts.size - 1, i + 2)]

            val cp1x = p1.x + (p2.x - p0.x) / 6f
            val cp1y = (p1.y + (p2.y - p0.y) / 6f).coerceIn(clampMin, clampMax)
            val cp2x = p2.x - (p3.x - p1.x) / 6f
            val cp2y = (p2.y - (p3.y - p1.y) / 6f).coerceIn(clampMin, clampMax)
            outPath.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
        }
        if (closeArea) {
            outPath.lineTo(pts.last().x, bottomY)
            outPath.lineTo(pts.first().x, bottomY)
            outPath.close()
        }
    }
}
