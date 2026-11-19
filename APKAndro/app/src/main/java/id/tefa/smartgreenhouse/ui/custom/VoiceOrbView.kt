package id.tefa.smartgreenhouse.ui.custom

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

class VoiceOrbView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    enum class OrbMode { IDLE, LISTENING, SPEAKING }

    private var mode: OrbMode = OrbMode.IDLE
    private var orbPhase = 0f
    private var smoothedEnergy = 0.04f
    private var speechPulse = 0f
    private var animRunning = false

    private val spherePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val corePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    private var cachedRadius = -1f
    private var cachedCx = -1f
    private var cachedCy = -1f

    fun setMode(newMode: OrbMode) {
        mode = newMode
        invalidate()
    }

    fun triggerPulse(strength: Float = 1f) {
        speechPulse = strength.coerceIn(0f, 1f)
    }

    fun startAnimation() {
        if (!animRunning) {
            animRunning = true
            postInvalidateOnAnimation()
        }
    }

    fun stopAnimation() {
        animRunning = false
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (visibility == VISIBLE) {
            startAnimation()
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cx = w * 0.5f
        val cy = h * 0.5f
        val rMax = min(w, h) * 0.44f
        val density = resources.displayMetrics.density
        val step = (4.8f * density).coerceAtLeast(6f)

        val targetEnergy = when (mode) {
            OrbMode.IDLE -> 0.04f
            OrbMode.LISTENING -> {
                val basePulse = 0.18f + 0.09f * sin(orbPhase * 1.9f)
                min(1f, basePulse + speechPulse * 0.55f)
            }
            OrbMode.SPEAKING -> {
                val cadence = abs(sin(orbPhase * 2.4f)) * 0.48f +
                    abs(cos(orbPhase * 3.9f)) * 0.28f +
                    sin(orbPhase * 1.1f) * 0.08f
                min(1f, 0.22f + cadence.coerceAtLeast(0f) * 0.65f)
            }
        }

        speechPulse *= 0.88f
        smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.18f
        orbPhase += if (mode == OrbMode.IDLE) 0.035f else (0.078f + smoothedEnergy * 0.08f)

        val sphereR = rMax * 1.06f
        if (cachedRadius != sphereR || cachedCx != cx || cachedCy != cy) {
            cachedRadius = sphereR
            cachedCx = cx
            cachedCy = cy
            spherePaint.shader = RadialGradient(
                cx,
                cy,
                sphereR,
                intArrayOf(0xF0060A08.toInt(), 0xE0060A08.toInt(), 0x8F060A08.toInt(), 0x00060A08),
                floatArrayOf(0f, 0.58f, 0.86f, 1f),
                Shader.TileMode.CLAMP
            )
        }
        canvas.drawCircle(cx, cy, sphereR, spherePaint)

        val coreRadius = (0.125f + smoothedEnergy * 0.024f) * rMax
        val coreAlpha = ((0.52f + smoothedEnergy * 0.16f) * 255f).toInt().coerceIn(0, 255)
        corePaint.color = (coreAlpha shl 24) or 0x9B9E9C
        canvas.drawCircle(cx, cy, coreRadius, corePaint)

        val ringCenter = 0.38f + smoothedEnergy * 0.042f
        val ringSpread = 0.082f + smoothedEnergy * 0.034f
        val scaleFactor = rMax / 176f

        var dy = -rMax
        while (dy <= rMax) {
            var dx = -rMax
            while (dx <= rMax) {
                val r = sqrt(dx * dx + dy * dy)
                if (r <= rMax) {
                    val u = r / rMax
                    val theta = atan2(dy.toDouble(), dx.toDouble()).toFloat()
                    val angularWave =
                        sin(theta * 3f + orbPhase) * (0.012f + smoothedEnergy * 0.032f) +
                            cos(theta * 5f - orbPhase * 1.35f) * (0.008f + smoothedEnergy * 0.022f)
                    val localCenter = ringCenter + angularWave
                    val ringVal = exp(-((u - localCenter) / ringSpread).pow(2))

                    val outerFalloff = if (u > localCenter) {
                        val tOut = ((u - localCenter) / (1f - localCenter).coerceAtLeast(0.01f)).coerceAtMost(1f)
                        (1f - tOut).pow(1.85f) * 0.56f
                    } else {
                        val tIn = u / localCenter.coerceAtLeast(0.01f)
                        0.20f + 0.16f * tIn
                    }

                    val intensity = min(1f, ringVal * 1.18f + outerFalloff * 0.85f)
                    val edgeFade = if (u > 0.9f) ((1f - u) / 0.1f).coerceAtLeast(0.15f) else 1f
                    var halfSize = (0.42f + intensity.pow(1.65f) * (3.15f + smoothedEnergy * 1.1f)) * scaleFactor
                    var alphaFloat = ((0.28f + intensity.pow(1.1f) * 0.72f) * edgeFade).coerceAtMost(1f)
                    if (u < 0.12f) {
                        halfSize = (0.72f + smoothedEnergy * 0.35f) * scaleFactor
                        alphaFloat = 0.42f + smoothedEnergy * 0.18f
                    }

                    val a = (alphaFloat * 255f).toInt().coerceIn(0, 255)
                    dotPaint.color = (a shl 24) or 0xFFFFFF
                    val px = cx + dx
                    val py = cy + dy
                    canvas.drawRect(px - halfSize, py - halfSize, px + halfSize, py + halfSize, dotPaint)
                }
                dx += step
            }
            dy += step
        }

        if (animRunning && visibility == VISIBLE) {
            postInvalidateOnAnimation()
        }
    }
}
