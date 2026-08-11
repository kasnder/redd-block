package net.kollnig.reddblockandroid.gate

import android.app.Activity
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import net.kollnig.reddblockandroid.plugin.R
import net.kollnig.reddblockandroid.data.Schedule
import net.kollnig.reddblockandroid.schedule.Schedules
import net.kollnig.reddblockandroid.util.defaultPauseMinutes
import net.kollnig.reddblockandroid.util.isPrefsInitialized
import net.kollnig.reddblockandroid.util.prefs
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

/**
 * Native friction gate, launched by [net.kollnig.reddblockandroid.service.BlockerService]
 * when a blocked app/website is opened. Replaces the previous flow of launching the
 * full Tauri webview activity, which took seconds to cold-start — unacceptable
 * latency for an interception surface. Visually mirrors the webview pause modal
 * (src/index.html #pause-modal); on success it pauses the schedule natively via
 * [Schedules.pauseSchedule], and the webview reconciles pause state from Kotlin
 * on its next resume (`getScheduleStates`).
 */
class UnlockActivity : Activity() {

    companion object {
        // Same extras BlockerService already used for the webview friction gate.
        const val EXTRA_SCHEDULE_ID = "friction_schedule_id"
        const val EXTRA_SCHEDULE_NAME = "friction_schedule_name"
        const val EXTRA_BLOCKED_TARGET = "friction_blocked_target"
        const val EXTRA_IS_WEBSITE = "friction_is_website"

        private val WORD_LIST = listOf(
            "apple", "bridge", "candle", "desert", "eagle", "forest", "garden",
            "harbor", "island", "jungle", "kitchen", "lemon", "mirror", "needle",
            "orange", "palace", "quiet", "river", "silver", "temple", "under",
            "valley", "winter", "yellow", "anchor", "basket", "castle", "dragon",
            "engine", "flower", "guitar", "hammer", "insect", "jacket", "kitten",
            "lantern", "marble", "nature", "ocean", "pencil", "rabbit", "saddle",
            "timber", "umbrella", "velvet", "walnut", "zenith", "branch", "copper",
            "danger", "eleven", "falcon", "gentle", "hollow", "ivory", "jigsaw",
            "kettle", "lumber", "mango", "narrow", "oyster", "pepper", "quartz",
            "rocket", "sunset", "trophy", "unfold", "voyage", "window", "absent",
            "butter", "circle", "dinner", "elbow", "finger", "gravel", "helmet",
            "indent", "jumble", "kernel", "ladder", "mental", "notice", "offset",
            "planet", "riddle", "spiral", "thread", "unique", "vertex", "wander",
            "ballet", "carbon", "differ", "effort", "fabric", "global", "hidden",
            "impact", "knight", "linear", "method", "normal", "obtain",
            "parent", "random", "simple", "travel", "update", "vision", "weekly"
        )
    }

    private lateinit var words: List<String>
    private var currentWordIndex = 0
    private var challengePassed = false

    private lateinit var scheduleId: String
    private var isWebsite = false

    private lateinit var wordProgress: TextView
    private lateinit var currentWord: TextView
    private lateinit var wordInput: EditText
    private lateinit var progressBar: ProgressBar
    private lateinit var confirmBtn: Button
    private lateinit var daysInput: EditText
    private lateinit var hoursInput: EditText
    private lateinit var minutesInput: EditText
    private lateinit var restartTime: TextView
    private lateinit var nextDayBadge: TextView

    private var accentColor = 0
    private var dangerColor = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // The gate can be the first component of a fresh process — the
        // AccessibilityService lives in the same process but init here too
        // to be safe (mirrors BlockerService.onServiceConnected).
        if (!isPrefsInitialized) {
            val deviceContext = createDeviceProtectedStorageContext()
            prefs = deviceContext.getSharedPreferences("prefs", MODE_PRIVATE)
        }

        val id = intent.getStringExtra(EXTRA_SCHEDULE_ID)
        val schedule = id?.let { Schedules.get(it) }
        if (id == null || schedule == null || !schedule.isEnabled) {
            finish()
            return
        }
        scheduleId = id
        isWebsite = intent.getBooleanExtra(EXTRA_IS_WEBSITE, false)
        val blockedTarget = intent.getStringExtra(EXTRA_BLOCKED_TARGET) ?: ""

        setContentView(R.layout.activity_unlock)
        applyEdgeToEdgeInsets()
        bindViews()
        applyScheduleBranding(schedule, blockedTarget)
        setupChallenge(schedule)
        setupDurationInputs()
        setupButtons()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTask delivers a fresh block target to the existing instance;
        // re-render with the new extras.
        setIntent(intent)
        recreate()
    }

    override fun onResume() {
        super.onResume()
        if (!challengePassed) {
            wordInput.requestFocus()
            wordInput.post {
                (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
                    .showSoftInput(wordInput, InputMethodManager.SHOW_IMPLICIT)
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        dismissGate()
    }

    /**
     * On Android 15+ (targetSdk 35) system bars are always transparent and
     * the window draws edge-to-edge, so the content would otherwise slide
     * under the status bar (title colliding with the clock) and the gesture
     * nav bar. Keep the cream background full-bleed but pad the content
     * column by the system-bar + IME insets. The existing 20dp horizontal /
     * 24dp bottom paddings are preserved and the bar insets added on top.
     */
    private fun applyEdgeToEdgeInsets() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val content = findViewById<LinearLayout>(R.id.gate_content)
        val basePadStart = content.paddingStart
        val basePadEnd = content.paddingEnd
        val basePadBottom = content.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            view.updatePadding(
                left = basePadStart + bars.left,
                right = basePadEnd + bars.right,
                top = bars.top,
                bottom = basePadBottom + bars.bottom
            )
            insets
        }
    }

    private fun bindViews() {
        wordProgress = findViewById(R.id.gate_word_progress)
        currentWord = findViewById(R.id.gate_current_word)
        wordInput = findViewById(R.id.gate_word_input)
        progressBar = findViewById(R.id.gate_progress_bar)
        confirmBtn = findViewById(R.id.gate_confirm_btn)
        daysInput = findViewById(R.id.gate_pause_days)
        hoursInput = findViewById(R.id.gate_pause_hours)
        minutesInput = findViewById(R.id.gate_pause_minutes)
        restartTime = findViewById(R.id.gate_restart_time)
        nextDayBadge = findViewById(R.id.gate_next_day_badge)
    }

    private fun applyScheduleBranding(schedule: Schedule, blockedTarget: String) {
        accentColor = parseColorOr(schedule.color, getColor(R.color.gate_accent))
        dangerColor = getColor(R.color.gate_danger)

        findViewById<TextView>(R.id.gate_chip_emoji).text = schedule.emoji ?: "🚫"
        findViewById<TextView>(R.id.gate_chip_name).text = schedule.name

        findViewById<TextView>(R.id.gate_subtitle).text = if (blockedTarget.isNotEmpty()) {
            getString(R.string.gate_blocking_target, blockedTarget)
        } else {
            getString(R.string.gate_blocking_generic)
        }

        // Tint the branded surfaces with the blocklist colour, like the web
        // modal's applyModalBlocklistTint / challenge progress bar.
        currentWord.setTextColor(accentColor)
        currentWord.backgroundTintList =
            ColorStateList.valueOf((accentColor and 0x00FFFFFF) or 0x14000000)
        findViewById<LinearLayout>(R.id.gate_room_chip).backgroundTintList =
            ColorStateList.valueOf((accentColor and 0x00FFFFFF) or 0x1A000000)
        progressBar.progressTintList = ColorStateList.valueOf(accentColor)
    }

    private fun parseColorOr(hex: String?, fallback: Int): Int = try {
        if (hex.isNullOrBlank()) fallback else Color.parseColor(hex)
    } catch (_: Exception) {
        fallback
    }

    private fun setupChallenge(schedule: Schedule) {
        val wordCount = schedule.frictionWordCount.coerceIn(1, WORD_LIST.size)
        words = WORD_LIST.shuffled().take(wordCount)
        findViewById<TextView>(R.id.gate_challenge_text).text = words.joinToString(" ")

        renderChallengeState()

        wordInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (challengePassed) return
                val typed = s?.toString()?.trim() ?: ""
                val expected = words.getOrNull(currentWordIndex) ?: return
                if (typed.equals(expected, ignoreCase = true)) {
                    advanceWord()
                } else {
                    // Mismatched prefix → coral text, like the web's wiggle cue.
                    val isPrefix = expected.startsWith(typed, ignoreCase = true)
                    wordInput.setTextColor(
                        if (isPrefix) getColor(R.color.gate_text_primary) else dangerColor
                    )
                }
            }
        })

        wordInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE && !challengePassed) {
                val typed = wordInput.text.toString().trim()
                val expected = words.getOrNull(currentWordIndex)
                if (expected != null && typed.equals(expected, ignoreCase = true)) advanceWord()
                else wordInput.setTextColor(dangerColor)
                true
            } else {
                false
            }
        }
    }

    private fun advanceWord() {
        currentWordIndex++
        if (currentWordIndex >= words.size) {
            challengePassed = true
        }
        wordInput.setText("")
        wordInput.setTextColor(getColor(R.color.gate_text_primary))
        if (challengePassed) {
            wordInput.isEnabled = false
            confirmBtn.isEnabled = true
            confirmBtn.alpha = 1f
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
                .hideSoftInputFromWindow(wordInput.windowToken, 0)
        }
        renderChallengeState()
    }

    private fun renderChallengeState() {
        val total = words.size
        val index = currentWordIndex.coerceAtMost(total - 1)
        progressBar.progress = (currentWordIndex * 1000) / total
        if (challengePassed) {
            wordProgress.text = getString(R.string.gate_word_progress, total, total)
            currentWord.visibility = View.GONE
            wordInput.visibility = View.GONE
        } else {
            wordProgress.text = getString(R.string.gate_word_progress, currentWordIndex + 1, total)
            currentWord.text = words[index]
        }
    }

    private fun setupDurationInputs() {
        // Prefill the user's configured default pause length (Settings →
        // "Default pause length"), falling back to the layout's 10 minutes.
        val total = defaultPauseMinutes()
        daysInput.setText((total / (24 * 60)).toString())
        hoursInput.setText(((total % (24 * 60)) / 60).toString())
        minutesInput.setText((total % 60).toString())

        val watcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) = updateRestartTime()
        }
        daysInput.addTextChangedListener(watcher)
        hoursInput.addTextChangedListener(watcher)
        minutesInput.addTextChangedListener(watcher)
        updateRestartTime()
    }

    private fun pauseDurationMs(): Long {
        val days = daysInput.text.toString().toLongOrNull() ?: 0
        val hours = hoursInput.text.toString().toLongOrNull() ?: 0
        val minutes = minutesInput.text.toString().toLongOrNull() ?: 0
        return ((days * 24 + hours) * 60 + minutes) * 60_000
    }

    private fun updateRestartTime() {
        val durationMs = pauseDurationMs()
        val restart = System.currentTimeMillis() + durationMs
        restartTime.text = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(restart))

        val today = Calendar.getInstance()
        val restartCal = Calendar.getInstance().apply { timeInMillis = restart }
        val sameDay = today.get(Calendar.YEAR) == restartCal.get(Calendar.YEAR) &&
            today.get(Calendar.DAY_OF_YEAR) == restartCal.get(Calendar.DAY_OF_YEAR)
        nextDayBadge.visibility = if (sameDay) View.GONE else View.VISIBLE
    }

    private fun setupButtons() {
        findViewById<ImageButton>(R.id.gate_back_btn).setOnClickListener { dismissGate() }
        findViewById<Button>(R.id.gate_cancel_btn).setOnClickListener { dismissGate() }
        confirmBtn.setOnClickListener {
            if (!challengePassed) return@setOnClickListener
            val durationMs = pauseDurationMs()
            if (durationMs <= 0) {
                dismissGate()
                return@setOnClickListener
            }
            Schedules.pauseSchedule(this, scheduleId, System.currentTimeMillis() + durationMs)
            // Finishing returns the user to the (now unblocked) app/browser.
            finish()
        }
    }

    /** Leaves without unlocking. For blocked apps, returning to them would
     *  immediately re-trigger the gate — go home instead. For websites the
     *  browser was already redirected away, so just finish. */
    private fun dismissGate() {
        if (isWebsite) {
            finish()
            return
        }
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(homeIntent)
        finish()
    }
}
