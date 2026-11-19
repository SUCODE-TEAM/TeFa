package id.tefa.smartgreenhouse.ui.custom

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View

class BotanicalBackgroundView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val density = resources.displayMetrics.density

    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1.6f * density
        color = 0x55A3C1B2
    }

    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        canvas.drawColor(0xFFEEF2F0.toInt())

        glowPaint.shader = RadialGradient(
            w * 0.1f,
            h * 0.12f,
            w * 0.6f,
            intArrayOf(0x99D8E2DC.toInt(), 0x00D8E2DC),
            null,
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w, h, glowPaint)

        glowPaint.shader = RadialGradient(
            w * 0.9f,
            h * 0.88f,
            w * 0.6f,
            intArrayOf(0x99D8E2DC.toInt(), 0x00D8E2DC),
            null,
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w, h, glowPaint)

        // Concentric botanical wave ripples (top-right and bottom-left)
        val step = 22f * density
        for (i in 1..10) {
            val r = i * step
            ringPaint.alpha = (95 - i * 7).coerceAtLeast(18)
            canvas.drawCircle(w + 18f * density, -18f * density, r, ringPaint)
            canvas.drawCircle(-18f * density, h + 18f * density, r, ringPaint)
        }
    }
}
