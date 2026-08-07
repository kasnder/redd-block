package net.kollnig.reddblockandroid.service

/**
 * Pure URL-bar parsing used by [BlockerService]: which browsers are supported,
 * which view IDs hold their URL, and how to turn that view's raw text into a
 * blockable domain.
 *
 * Deliberately free of Android framework types so it can be covered by JVM unit
 * tests (`BrowserUrlParserTest`) — this is the step that decides whether a
 * website block fires at all, and a browser-specific quirk here silently
 * disables blocking for that browser with no other symptom.
 */
object BrowserUrlParser {

    /** Maps browser package names to their URL bar view IDs */
    val browserUrlViewIds = mapOf(
        // Firefox variants
        "org.mozilla.firefox" to listOf("mozac_browser_toolbar_url_view", "url_bar_title", "ADDRESSBAR_URL_BOX"),
        "org.mozilla.firefox_beta" to listOf("mozac_browser_toolbar_url_view", "url_bar_title", "ADDRESSBAR_URL_BOX"),
        "org.mozilla.fenix" to listOf("mozac_browser_toolbar_url_view", "url_bar_title", "ADDRESSBAR_URL_BOX"),
        "org.mozilla.fenix.nightly" to listOf("mozac_browser_toolbar_url_view", "url_bar_title", "ADDRESSBAR_URL_BOX"),
        "org.mozilla.focus" to listOf("mozac_browser_toolbar_url_view", "url_bar_title", "ADDRESSBAR_URL_BOX"),
        // Chrome / Chromium
        "com.android.chrome" to listOf("url_bar", "origin", "display_url"),
        "com.chrome.beta" to listOf("url_bar", "display_url"),
        "org.chromium.chrome" to listOf("url_bar", "display_url"),
        // Brave
        "com.brave.browser" to listOf("url_bar", "display_url"),
        "com.brave.browser_beta" to listOf("url_bar", "display_url"),
        "com.brave.browser_nightly" to listOf("url_bar", "display_url"),
        // Samsung Internet
        "com.sec.android.app.sbrowser" to listOf("location_bar_edit_text"),
        "com.sec.android.app.sbrowser.beta" to listOf("location_bar_edit_text"),
        // Microsoft Edge
        "com.microsoft.emmx" to listOf("url_bar"),
        // Opera variants
        "com.opera.browser" to listOf("url_field"),
        "com.opera.browser.beta" to listOf("url_field"),
        "com.opera.mini.native" to listOf("url_field"),
        "com.opera.mini.native.beta" to listOf("url_field"),
        "com.opera.touch" to listOf("addressbarEdit"),
        // Vivaldi
        "com.vivaldi.browser" to listOf("url_bar", "display_url"),
        // Kiwi Browser
        "com.kiwibrowser.browser" to listOf("url_bar", "display_url"),
        // DuckDuckGo
        "com.duckduckgo.mobile.android" to listOf("omnibarTextInput"),
        // Ecosia
        "com.ecosia.android" to listOf("url_bar"),
        // Huawei Browser
        "com.huawei.browser" to listOf("url_bar"),
        // Android system browser (AOSP)
        "com.android.browser" to listOf("url"),
        // Google Search app (in-app browser)
        "com.google.android.googlequicksearchbox" to listOf("googleapp_srp_search_box_text"),
    )

    fun isSupportedBrowser(packageName: String): Boolean = packageName in browserUrlViewIds

    /**
     * Picks the first URL-looking word out of a URL bar's raw text, or null if
     * there is none (empty bar, search query, new tab page).
     */
    fun findUrlInText(rawText: String): String? {
        val words = stripInvisibleMarks(rawText).split("\\s+".toRegex())
        for (word in words) {
            val cleanWord = word.trimEnd('.', ',')
            if (isValidUrlFormat(cleanWord)) return cleanWord
        }
        return null
    }

    /**
     * Removes bidi/zero-width control characters from URL-bar text:
     * U+200B..U+200F (zero-width space/joiners, LTR/RTL mark),
     * U+202A..U+202E (embeddings/override), U+2066..U+2069 (isolates), U+FEFF (BOM).
     *
     * Samsung Internet prefixes its `location_bar_edit_text` with a LEFT-TO-RIGHT
     * MARK (U+200E) — invisible, but enough to make the domain fail
     * [isValidUrlFormat], so Samsung Internet never blocked before this. Other
     * browsers wrap URLs in bidi isolates for the same spoofing-protection reason.
     */
    fun stripInvisibleMarks(text: String): String =
        if (text.any { isInvisibleMark(it) }) text.filterNot { isInvisibleMark(it) } else text

    private fun isInvisibleMark(c: Char): Boolean {
        val code = c.code
        return code in 0x200B..0x200F ||
            code in 0x202A..0x202E ||
            code in 0x2066..0x2069 ||
            code == 0xFEFF
    }

    fun isValidUrlFormat(text: String): Boolean {
        val trimmed = text.trim()
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true
        if (trimmed.contains(" ") || trimmed.length < 4) return false
        val domainPattern = Regex("^[a-zA-Z0-9][a-zA-Z0-9.-]*\\.[a-zA-Z]{2,}(/.*)?$")
        return domainPattern.matches(trimmed)
    }

    /** Lowercased host with "www." stripped, or null if [url] has no parseable host. */
    fun extractDomain(url: String): String? {
        return try {
            var normalizedUrl = stripInvisibleMarks(url).trim()
            if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
                normalizedUrl = "https://$normalizedUrl"
            }
            java.net.URI(normalizedUrl).host?.lowercase()?.removePrefix("www.")
        } catch (_: Exception) {
            null
        }
    }
}
