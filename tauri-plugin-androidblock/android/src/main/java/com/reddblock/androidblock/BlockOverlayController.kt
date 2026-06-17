package com.reddblock.androidblock

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.LayerDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.drawable.DrawableCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

/**
 * Fullscreen blocking UI drawn via TYPE_ACCESSIBILITY_OVERLAY from
 * [BlockerService]. Styled to match desktop blocked.html and iOS shield copy.
 */
class BlockOverlayController(
    private val service: AccessibilityService,
    private val onClose: () -> Unit
) {
    private var overlayView: View? = null
    private var windowManager: WindowManager? = null
    private var currentTargetKey: String? = null
    private var activeMatch: BlockMatch? = null

    private val handler = Handler(Looper.getMainLooper())
    private var tickRunnable: Runnable? = null
    private var scheduleReceiver: BroadcastReceiver? = null

    fun isShowing(): Boolean = overlayView != null

    fun isShowingFor(targetKey: String): Boolean {
        return overlayView != null && currentTargetKey == targetKey
    }

    fun show(match: BlockMatch) {
        val targetKey = targetKeyFor(match)
        activeMatch = match

        if (isShowingFor(targetKey)) {
            overlayView?.let { bindContent(it, match) }
            return
        }

        dismiss(sendHome = false)

        val themedContext = service.createConfigurationContext(service.resources.configuration)
        val inflater = LayoutInflater.from(themedContext)
        val root = inflater.inflate(R.layout.block_overlay, null)
        applyOpaqueScrim(root)
        bindContent(root, match)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.OPAQUE
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            params.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        val closeAction = View.OnClickListener {
            dismiss(sendHome = true)
        }
        root.findViewById<ImageButton>(R.id.block_overlay_dismiss).setOnClickListener(closeAction)
        root.findViewById<Button>(R.id.block_overlay_close).setOnClickListener(closeAction)
        root.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                dismiss(sendHome = true)
                true
            } else {
                false
            }
        }
        root.requestFocus()

        val wm = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        wm.addView(root, params)
        applyWindowInsets(root)

        overlayView = root
        windowManager = wm
        currentTargetKey = targetKey
        startLiveUpdates()
    }

    fun dismiss(sendHome: Boolean) {
        stopLiveUpdates()
        val view = overlayView ?: return
        try {
            windowManager?.removeView(view)
        } catch (_: Exception) {
            // View may already be detached if the service is stopping.
        }
        overlayView = null
        windowManager = null
        currentTargetKey = null
        activeMatch = null
        if (sendHome) onClose()
    }

    private fun startLiveUpdates() {
        stopLiveUpdates()

        scheduleReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == Schedules.ACTION_CHANGED) {
                    refreshFromStore()
                }
            }
        }
        ContextCompat.registerReceiver(
            service,
            scheduleReceiver!!,
            IntentFilter(Schedules.ACTION_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        tickRunnable = object : Runnable {
            override fun run() {
                refreshFromStore()
                handler.postDelayed(this, TICK_MS)
            }
        }
        handler.post(tickRunnable!!)
    }

    private fun stopLiveUpdates() {
        tickRunnable?.let { handler.removeCallbacks(it) }
        tickRunnable = null
        scheduleReceiver?.let {
            try {
                service.unregisterReceiver(it)
            } catch (_: Exception) {
                // Receiver may already be unregistered.
            }
        }
        scheduleReceiver = null
    }

    private fun refreshFromStore() {
        val match = activeMatch ?: return
        val updated = when (match.blockKind) {
            BlockKind.APP -> match.blockedPackage?.let {
                Schedules.findAppBlockMatch(service, it)
            }
            BlockKind.WEBSITE -> match.blockedDomain?.let {
                Schedules.findWebsiteBlockMatch(service, it, match.blockedPackage)
            }
        }
        if (updated == null) {
            dismiss(sendHome = false)
            return
        }

        if (updated != activeMatch) {
            activeMatch = updated
            overlayView?.let { bindContent(it, updated) }
        } else {
            overlayView?.let { updateTimingDisplay(it, updated) }
        }
    }

    private fun applyWindowInsets(root: View) {
        val content = root.findViewById<LinearLayout>(R.id.block_overlay_content) ?: return
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            val topInset = max(bars.top, cutout.top).coerceAtLeast(statusBarHeightFallback())
            content.setPadding(
                max(bars.left, cutout.left),
                topInset,
                max(bars.right, cutout.right),
                bars.bottom
            )
            insets
        }
        ViewCompat.requestApplyInsets(root)
    }

    private fun statusBarHeightFallback(): Int {
        val resourceId = service.resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (resourceId > 0) service.resources.getDimensionPixelSize(resourceId) else 0
    }

    /** Force a fully opaque canvas so the blocked app cannot bleed through the overlay. */
    private fun applyOpaqueScrim(root: View) {
        val scrimColor = opaqueColor(
            ContextCompat.getColor(service, R.color.block_canvas)
        )
        root.setBackgroundColor(scrimColor)
        root.findViewById<View>(R.id.block_overlay_scrim)?.setBackgroundColor(scrimColor)
    }

    private fun opaqueColor(color: Int): Int {
        return Color.rgb(Color.red(color), Color.green(color), Color.blue(color))
    }

    private fun bindContent(root: View, match: BlockMatch) {
        root.findViewById<ImageView>(R.id.block_overlay_header_logo)?.setImageDrawable(
            loadRoundedAppLogo()
        )

        val heroIcon = root.findViewById<ImageView>(R.id.block_overlay_hero_icon)
        heroIcon.setImageDrawable(resolveHeroIcon(match))

        val subtitleRes = subtitleResFor(match)
        root.findViewById<TextView>(R.id.block_overlay_subtitle).text =
            service.getString(subtitleRes, match.blockedLabel)

        val pill = root.findViewById<LinearLayout>(R.id.block_overlay_pill)
        val pillColor = opaqueColor(parseBlocklistColor(service, match.blocklistColor))
        ContextCompat.getDrawable(service, R.drawable.block_pill_background)?.mutate()?.let { drawable ->
            DrawableCompat.setTint(drawable, pillColor)
            pill.background = drawable
        }

        val emojiView = root.findViewById<TextView>(R.id.block_overlay_pill_emoji)
        val emoji = match.blocklistEmoji?.trim().orEmpty()
        if (emoji.isEmpty()) {
            emojiView.visibility = View.GONE
        } else {
            emojiView.visibility = View.VISIBLE
            emojiView.text = emoji
        }
        root.findViewById<TextView>(R.id.block_overlay_pill_name).text = match.blocklistName

        val targetLabelRes = when (match.blockKind) {
            BlockKind.APP -> R.string.block_overlay_target_app
            BlockKind.WEBSITE -> R.string.block_overlay_target_site
        }
        root.findViewById<TextView>(R.id.block_overlay_target_label)
            .setText(targetLabelRes)
        root.findViewById<TextView>(R.id.block_overlay_target_value).text = match.blockedLabel
        root.findViewById<TextView>(R.id.block_overlay_blocklist_value).text = match.blocklistName

        bindStartedRow(root, match)
        updateTimingDisplay(root, match)
    }

    private fun bindStartedRow(root: View, match: BlockMatch) {
        val startedRow = root.findViewById<LinearLayout>(R.id.block_overlay_started_row)
        val startedAtMs = match.segmentStartedAtMs
        if (match.blockSource == BlockSource.SCHEDULE && startedAtMs != null) {
            startedRow.visibility = View.VISIBLE
            root.findViewById<TextView>(R.id.block_overlay_started_value).text =
                formatClock(startedAtMs)
        } else {
            startedRow.visibility = View.GONE
        }
    }

    private fun updateTimingDisplay(root: View, match: BlockMatch) {
        val endsRow = root.findViewById<LinearLayout>(R.id.block_overlay_ends_row)
        val endsAtMs = match.segmentEndsAtMs
        if (endsAtMs == null) {
            endsRow.visibility = View.GONE
            return
        }

        val remainingMs = endsAtMs - System.currentTimeMillis()
        if (remainingMs <= 0) {
            endsRow.visibility = View.GONE
            return
        }

        endsRow.visibility = View.VISIBLE
        root.findViewById<TextView>(R.id.block_overlay_ends_label)
            .setText(R.string.block_overlay_ends_in)

        val countdownView = root.findViewById<TextView>(R.id.block_overlay_ends_countdown)
        val suffixView = root.findViewById<TextView>(R.id.block_overlay_ends_at_suffix)

        countdownView.text = formatHms(remainingMs)
        suffixView.text = service.getString(
            R.string.block_overlay_ends_at_suffix,
            formatClock(endsAtMs)
        )
    }

    private fun subtitleResFor(match: BlockMatch): Int {
        return when (match.blockSource) {
            BlockSource.ONE_OFF -> when (match.blockKind) {
                BlockKind.APP -> R.string.block_overlay_subtitle_app_blocklist
                BlockKind.WEBSITE -> R.string.block_overlay_subtitle_site_blocklist
            }
            BlockSource.SCHEDULE -> when (match.blockKind) {
                BlockKind.APP -> R.string.block_overlay_subtitle_app_schedule
                BlockKind.WEBSITE -> R.string.block_overlay_subtitle_site_schedule
            }
        }
    }

    private fun targetKeyFor(match: BlockMatch): String {
        return when (match.blockKind) {
            BlockKind.APP -> "app:${match.blockedPackage}"
            BlockKind.WEBSITE -> "site:${match.blockedDomain}"
        }
    }

    private fun loadRoundedAppLogo(): Drawable {
        val source = loadSquareAppIcon()
        val sizePx = service.resources.getDimensionPixelSize(R.dimen.block_header_logo_size)
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        source.setBounds(0, 0, sizePx, sizePx)
        source.draw(canvas)
        val rounded = RoundedBitmapDrawableFactory.create(service.resources, bitmap)
        rounded.cornerRadius = sizePx * 0.146f
        return rounded
    }

    private fun loadSquareAppIcon(): Drawable {
        val icon = service.packageManager.getApplicationIcon(service.packageName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && icon is AdaptiveIconDrawable) {
            val background = icon.background ?: return icon
            val foreground = icon.foreground
            return if (foreground != null) {
                LayerDrawable(arrayOf(background, foreground))
            } else {
                background
            }
        }
        return icon
    }

    private fun resolveHeroIcon(match: BlockMatch): Drawable {
        val pm = service.packageManager
        val packageName = when (match.blockKind) {
            BlockKind.APP -> match.blockedPackage
            BlockKind.WEBSITE -> match.blockedPackage
        }

        if (!packageName.isNullOrBlank()) {
            try {
                return pm.getApplicationIcon(packageName)
            } catch (_: PackageManager.NameNotFoundException) {
                // Fall through to default icon.
            }
        }

        return DrawableCompat.wrap(
            ContextCompat.getDrawable(service, R.drawable.ic_globe)!!
        )
    }

    companion object {
        private const val TICK_MS = 1000L

        fun parseBlocklistColor(context: Context, raw: String?): Int {
            val fallback = ContextCompat.getColor(context, R.color.block_accent)
            val value = raw?.trim().orEmpty()
            if (value.isEmpty()) return fallback
            return try {
                Color.parseColor(if (value.startsWith("#")) value else "#$value")
            } catch (_: IllegalArgumentException) {
                fallback
            }
        }

        fun formatHms(remainingMs: Long): String {
            val ms = max(0L, remainingMs)
            val totalSec = (ms + 500) / 1000
            val hours = totalSec / 3600
            val minutes = (totalSec % 3600) / 60
            val seconds = totalSec % 60
            return when {
                hours > 0 -> String.format(Locale.getDefault(), "%dh %02dm", hours, minutes)
                minutes > 0 -> String.format(Locale.getDefault(), "%dm %02ds", minutes, seconds)
                else -> String.format(Locale.getDefault(), "%ds", seconds)
            }
        }

        fun formatClock(unixMs: Long): String {
            val formatter = DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault())
            return formatter.format(Date(unixMs))
        }
    }
}
