package net.kollnig.reddblockandroid.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers the URL-bar parsing that decides whether a website block fires.
 *
 * The [REAL_URL_BAR_TEXTS] fixtures are verbatim `text` values dumped from the
 * accessibility tree of browsers on a real device (`uiautomator dump`), quirks
 * included — that is the only way a browser-specific oddity like Samsung
 * Internet's invisible U+200E prefix shows up, since it fails silently: the
 * browser stays in the supported-package map and simply never blocks.
 *
 * When adding a browser, dump its URL bar on a device and add the raw text here.
 */
class BrowserUrlParserTest {

    /** package -> (raw URL-bar text as dumped, expected blockable domain) */
    private val REAL_URL_BAR_TEXTS = listOf(
        // Samsung Internet 30.0.0.67 prefixes a LEFT-TO-RIGHT MARK (U+200E).
        Triple("com.sec.android.app.sbrowser", "\u200Ebbc.com", "bbc.com"),
        Triple("com.sec.android.app.sbrowser", "\u200Eft.com", "ft.com"),
        // DuckDuckGo 5.291.1 reports the bare domain.
        Triple("com.duckduckgo.mobile.android", "example.com", "example.com"),
        // Chromium-family browsers show the domain, sometimes with the scheme.
        Triple("com.android.chrome", "https://www.bbc.co.uk/news", "bbc.co.uk"),
        Triple("com.brave.browser", "bbc.co.uk", "bbc.co.uk"),
        // Firefox reports the full URL.
        Triple("org.mozilla.firefox", "https://reddit.com/r/all", "reddit.com"),
    )

    @Test
    fun `real device URL bar text yields the blockable domain`() {
        for ((pkg, rawText, expectedDomain) in REAL_URL_BAR_TEXTS) {
            assertTrue("$pkg should be a supported browser", BrowserUrlParser.isSupportedBrowser(pkg))
            val url = BrowserUrlParser.findUrlInText(rawText)
            assertEquals("no URL found in $pkg text ${rawText.escaped()}", true, url != null)
            assertEquals("wrong domain for $pkg text ${rawText.escaped()}",
                expectedDomain, BrowserUrlParser.extractDomain(url!!))
        }
    }

    @Test
    fun `invisible bidi and zero-width marks are stripped`() {
        // U+200E LTR mark (Samsung), U+200F RTL mark, U+2066..U+2069 isolates,
        // U+202A..U+202E embeddings, U+200B zero-width space, U+FEFF BOM.
        val wrapped = "\u2066\u202A\u200Ereddit.com\u200B\u202C\u2069\uFEFF"
        assertEquals("reddit.com", BrowserUrlParser.stripInvisibleMarks(wrapped))
        assertEquals("reddit.com", BrowserUrlParser.extractDomain(BrowserUrlParser.findUrlInText(wrapped)!!))
    }

    @Test
    fun `visible text is left untouched`() {
        assertEquals("bbc.co.uk/news", BrowserUrlParser.stripInvisibleMarks("bbc.co.uk/news"))
    }

    @Test
    fun `non-URL bar contents are not treated as URLs`() {
        // Search queries, hints and empty bars must not produce a domain —
        // a false positive here blocks a page the user never visited.
        for (text in listOf("", "   ", "Search or type URL", "how to focus", "reddit", "3.5")) {
            assertNull("unexpectedly parsed a URL out of ${text.escaped()}",
                BrowserUrlParser.findUrlInText(text))
        }
    }

    @Test
    fun `domains are normalised for matching`() {
        assertEquals("reddit.com", BrowserUrlParser.extractDomain("https://WWW.Reddit.com/r/all"))
        assertEquals("old.reddit.com", BrowserUrlParser.extractDomain("old.reddit.com/r/all"))
        assertEquals("reddit.com", BrowserUrlParser.extractDomain("reddit.com"))
        assertNull(BrowserUrlParser.extractDomain("not a url"))
    }

    @Test
    fun `URL is found among surrounding words`() {
        // Some browsers expose "Secure connection example.com" style content descriptions.
        assertEquals("example.com", BrowserUrlParser.findUrlInText("Secure connection example.com"))
        assertEquals("example.com", BrowserUrlParser.findUrlInText("Visited example.com."))
    }

    @Test
    fun `every supported browser has at least one view id`() {
        for ((pkg, ids) in BrowserUrlParser.browserUrlViewIds) {
            assertTrue("$pkg has no URL bar view ids", ids.isNotEmpty())
            assertTrue("$pkg has a blank view id", ids.all { it.isNotBlank() })
        }
    }

    private fun String.escaped() =
        map { if (it.code in 0x20..0x7E) it.toString() else "\\u%04X".format(it.code) }.joinToString("")
}
