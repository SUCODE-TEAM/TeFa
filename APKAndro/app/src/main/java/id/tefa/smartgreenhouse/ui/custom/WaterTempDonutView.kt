package id.tefa.smartgreenhouse.ui.custom

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.util.AttributeSet
import android.view.View
import java.util.Locale
import kotlin.math.min

class WaterTempDonutView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var waterTemp: Double? = null

    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = 0xFFEBF0ED.toInt()
    }

    private val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        color = 0xFF1B4332.toInt()
    }

    private val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private val unitPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        color = 0xFF4A5D52.toInt()
    }

    private val ovalRect = RectF()

    fun setTemperature(temp: Double?) {
        waterTemp = temp
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desired = (176 * resources.displayMetrics.density).toInt()
        val w = resolveSize(desired, widthMeasureSpec)
        val h = resolveSize(desired, heightMeasureSpec)
        val size = min(w, h)
        setMeasuredDimension(size, size)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val size = min(width, height).toFloat()
        if (size <= 0f) return

        val density = resources.displayMetrics.density
        val stroke = 18f * density
        trackPaint.strokeWidth = stroke
        progressPaint.strokeWidth = stroke

        val pad = stroke / 2f + 4f * density
        ovalRect.set(pad, pad, size - pad, size - pad)

        canvas.drawArc(ovalRect, 0f, 360f, false, trackPaint)

        val wt = waterTemp
        if (wt != null) {
            val sweep = ((wt / 50.0) * 360.0).toFloat().coerceIn(0f, 360f)
            canvas.drawArc(ovalRect, -90f, sweep, false, progressPaint)

            valuePaint.color = 0xFF0D2818.toInt()
            valuePaint.textSize = 32f * density
            val textY = size / 2f + (2f * density)
            canvas.drawText(String.format(Locale.US, "%.1f°", wt), size / 2f, textY, valuePaint)
        } else {
            valuePaint.color = 0xFF4A5D52.toInt()
            valuePaint.textSize = 28f * density
            val textY = size / 2f + (2f * density)
            canvas.drawText("N/A", size / 2f, textY, valuePaint)
        }

        unitPaint.textSize = 12.5f * density
        canvas.drawText("Celcius", size / 2f, size / 2f + 22f * density, unitPaint)
    }
}
