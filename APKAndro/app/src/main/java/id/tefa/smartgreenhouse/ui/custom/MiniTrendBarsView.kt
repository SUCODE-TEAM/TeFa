package id.tefa.smartgreenhouse.ui.custom

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import kotlin.math.max

class MiniTrendBarsView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var values: List<Float> = emptyList()
    private var maxValue: Float = 50f

    private val density = resources.displayMetrics.density
    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val barRect = RectF()

    fun setBars(newValues: List<Float>, maxVal: Float) {
        values = newValues.takeLast(13)
        maxValue = max(1f, maxVal)
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val h = resolveSize((48 * density).toInt(), heightMeasureSpec)
        val w = resolveSize((240 * density).toInt(), widthMeasureSpec)
        setMeasuredDimension(w, h)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val count = 13
        val gap = 5f * density
        val barW = ((w - gap * (count - 1)) / count).coerceAtLeast(3f * density)
        val radius = 3f * density
        val minBarH = 4f * density
        val offset = count - values.size

        for (i in 0 until count) {
            val valIdx = i - offset
            val v = if (valIdx in values.indices) values[valIdx] else null
            val left = i * (barW + gap)
            val right = left + barW

            val barH: Float
            if (v != null && v > 0f) {
                barPaint.color = 0xFF1B4332.toInt()
                barH = ((v / maxValue) * (h - 4f * density)).coerceIn(6f * density, h - 2f * density)
            } else {
                barPaint.color = 0xFFEBF0ED.toInt()
                barH = minBarH
            }
            barRect.set(left, h - barH, right, h)
            canvas.drawRoundRect(barRect, radius, radius, barPaint)
        }
    }
}
