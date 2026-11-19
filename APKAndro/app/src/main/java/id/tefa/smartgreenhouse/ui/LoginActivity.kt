package id.tefa.smartgreenhouse.ui

import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.method.HideReturnsTransformationMethod
import android.text.method.PasswordTransformationMethod
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import id.tefa.smartgreenhouse.R
import id.tefa.smartgreenhouse.data.PreferencesManager
import id.tefa.smartgreenhouse.data.SessionStore
import java.util.Locale

class LoginActivity : AppCompatActivity() {

    private lateinit var prefs: PreferencesManager
    private lateinit var usernameInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var rememberMeCheck: CheckBox
    private lateinit var togglePasswordBtn: ImageButton
    private lateinit var submitBtn: MaterialButton
    private lateinit var viewerLoginBtn: MaterialButton
    private lateinit var linkViewer: TextView
    private lateinit var demoChip: TextView
    private lateinit var cardElement: View
    private lateinit var loginToast: LinearLayout
    private lateinit var loginToastText: TextView

    private val handler = Handler(Looper.getMainLooper())
    private var toastHideRunnable: Runnable? = null
    private var passwordVisible = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        prefs = PreferencesManager(this)
        usernameInput = findViewById(R.id.usernameInput)
        passwordInput = findViewById(R.id.passwordInput)
        rememberMeCheck = findViewById(R.id.rememberMeCheck)
        togglePasswordBtn = findViewById(R.id.togglePasswordBtn)
        submitBtn = findViewById(R.id.submitBtn)
        viewerLoginBtn = findViewById(R.id.viewerLoginBtn)
        linkViewer = findViewById(R.id.linkViewer)
        demoChip = findViewById(R.id.demoChip)
        cardElement = findViewById(R.id.cardElement)
        loginToast = findViewById(R.id.loginToast)
        loginToastText = findViewById(R.id.loginToastText)

        val savedUser = prefs.getRememberedUsername()
        if (!savedUser.isNullOrBlank()) {
            usernameInput.setText(savedUser)
            rememberMeCheck.isChecked = true
            passwordInput.requestFocus()
        }

        demoChip.setOnClickListener {
            usernameInput.setText("admin")
            passwordInput.setText("admin123")
            showToast("Kredensial demo terisi otomatis. Klik tombol Login!", isSuccess = true)
        }

        togglePasswordBtn.setOnClickListener {
            passwordVisible = !passwordVisible
            if (passwordVisible) {
                passwordInput.transformationMethod = HideReturnsTransformationMethod.getInstance()
                togglePasswordBtn.setImageResource(R.drawable.ic_eye_open)
            } else {
                passwordInput.transformationMethod = PasswordTransformationMethod.getInstance()
                togglePasswordBtn.setImageResource(R.drawable.ic_eye_slash)
            }
            passwordInput.setSelection(passwordInput.text?.length ?: 0)
        }

        val openViewerAction = View.OnClickListener {
            SessionStore.switchToViewer("Pengunjung")
            showToast("Login berhasil! Mengalihkan ke Dashboard Viewer...", isSuccess = true)
            handler.postDelayed({ navigateToDashboard() }, 400)
        }
        viewerLoginBtn.setOnClickListener(openViewerAction)
        linkViewer.setOnClickListener(openViewerAction)

        passwordInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                attemptLogin()
                true
            } else {
                false
            }
        }

        submitBtn.setOnClickListener {
            attemptLogin()
        }
    }

    private fun attemptLogin() {
        val username = usernameInput.text?.toString()?.trim().orEmpty()
        val password = passwordInput.text?.toString().orEmpty()

        if (username.isEmpty() || password.isEmpty()) {
            showToast("Harap lengkapi Username dan Kata Sandi.", isSuccess = false)
            if (username.isEmpty()) usernameInput.requestFocus() else passwordInput.requestFocus()
            return
        }

        submitBtn.isEnabled = false
        submitBtn.text = "Memverifikasi..."
        submitBtn.alpha = 0.85f

        handler.postDelayed({
            val lowerUser = username.lowercase(Locale.US)
            val isValidAdmin = (lowerUser == "admin" && password == "admin123") ||
                (lowerUser == "admin@tefa.id" && password == "admin123") ||
                (lowerUser == "tefa" && password == "mappi32")

            val isValidViewer = (lowerUser == "viewer" && (password == "viewer" || password == "viewer123")) ||
                (lowerUser == "pengunjung" && (password == "pengunjung" || password == "123456" || password == "viewer"))

            when {
                isValidAdmin -> {
                    showToast("Login berhasil! Mengalihkan ke Dashboard Admin...", isSuccess = true)
                    prefs.saveRememberedUsername(if (rememberMeCheck.isChecked) username else null)
                    SessionStore.loginAsAdmin(username)
                    handler.postDelayed({ navigateToDashboard() }, 550)
                }
                isValidViewer -> {
                    showToast("Login berhasil! Mengalihkan ke Dashboard Viewer...", isSuccess = true)
                    prefs.saveRememberedUsername(if (rememberMeCheck.isChecked) username else null)
                    SessionStore.switchToViewer(username)
                    handler.postDelayed({ navigateToDashboard() }, 550)
                }
                else -> {
                    submitBtn.isEnabled = true
                    submitBtn.text = "Login"
                    submitBtn.alpha = 1f
                    showToast("Username atau Kata Sandi salah. Gunakan admin / admin123", isSuccess = false)
                    ObjectAnimator.ofFloat(
                        cardElement,
                        "translationX",
                        0f, -18f, 18f, -14f, 14f, -8f, 8f, 0f
                    ).apply {
                        duration = 380
                        start()
                    }
                    passwordInput.setText("")
                    passwordInput.requestFocus()
                }
            }
        }, 320)
    }

    private fun navigateToDashboard() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(intent)
        finish()
    }

    private fun showToast(message: String, isSuccess: Boolean) {
        toastHideRunnable?.let { handler.removeCallbacks(it) }
        loginToastText.text = message
        if (isSuccess) {
            loginToast.setBackgroundResource(R.drawable.bg_badge_online)
            loginToastText.setTextColor(ContextCompat.getColor(this, R.color.tefa_g5))
        } else {
            loginToast.setBackgroundResource(R.drawable.bg_badge_offline)
            loginToastText.setTextColor(ContextCompat.getColor(this, R.color.tefa_red_dark))
        }
        loginToast.visibility = View.VISIBLE
        val hide = Runnable { loginToast.visibility = View.GONE }
        toastHideRunnable = hide
        handler.postDelayed(hide, 3500)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
    }
}
