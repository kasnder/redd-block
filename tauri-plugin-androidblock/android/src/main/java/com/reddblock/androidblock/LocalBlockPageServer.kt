package com.reddblock.androidblock

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Serves the in-tab website block page on loopback so external browsers can
 * load it in the tab content area (desktop blocked.html parity).
 */
class LocalBlockPageServer(private val context: Context) {
    private val running = AtomicBoolean(false)
    private var serverSocket: ServerSocket? = null
    private var serverThread: Thread? = null
    @Volatile var port: Int = 0
        private set

    fun start(): Int {
        if (running.get() && port > 0) return port
        stop()
        val socket = ServerSocket()
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(HOST, 0))
        serverSocket = socket
        port = socket.localPort
        running.set(true)
        serverThread = thread(name = "LocalBlockPageServer", isDaemon = true) {
            while (running.get()) {
                try {
                    val client = socket.accept()
                    thread(isDaemon = true) { handleClient(client) }
                } catch (_: Exception) {
                    if (running.get()) {
                        Log.w(TAG, "Block page server accept failed")
                    }
                    break
                }
            }
        }
        Log.d(TAG, "Block page server listening on $HOST:$port")
        return port
    }

    fun stop() {
        running.set(false)
        try {
            serverSocket?.close()
        } catch (_: Exception) {
            // Socket may already be closed.
        }
        serverSocket = null
        serverThread = null
        port = 0
    }

    fun isBlockPageUrl(url: String): Boolean {
        val activePort = port
        if (activePort <= 0) return false
        val normalized = url.lowercase()
        return normalized.contains("$HOST:$activePort") ||
            normalized.contains("localhost:$activePort") ||
            normalized.contains("[::1]:$activePort")
    }

    fun buildBlockPageUrl(match: BlockMatch, originalUrl: String): String {
        val activePort = port
        require(activePort > 0) { "Block page server is not running" }
        val builder = Uri.parse("http://$HOST:$activePort/blocked").buildUpon()
            .appendQueryParameter("domain", match.blockedDomain.orEmpty())
            .appendQueryParameter("name", match.blocklistName)
            .appendQueryParameter("source", when (match.blockSource) {
                BlockSource.ONE_OFF -> "blocklist"
                BlockSource.SCHEDULE -> "schedule"
            })
            .appendQueryParameter("u", originalUrl)
        match.blocklistEmoji?.trim()?.takeIf { it.isNotEmpty() }?.let {
            builder.appendQueryParameter("emoji", it)
        }
        match.blocklistColor?.trim()?.takeIf { it.isNotEmpty() }?.let {
            builder.appendQueryParameter("color", it)
        }
        match.blockedPackage?.trim()?.takeIf { it.isNotEmpty() }?.let {
            builder.appendQueryParameter("browser", it)
        }
        match.segmentEndsAtMs?.let { builder.appendQueryParameter("endsAt", it.toString()) }
        match.segmentStartedAtMs?.let { builder.appendQueryParameter("startedAt", it.toString()) }
        return builder.build().toString()
    }

    private fun handleClient(client: Socket) {
        client.soTimeout = 5000
        try {
            client.getInputStream().bufferedReader().use { reader ->
                val requestLine = reader.readLine() ?: return
                val parts = requestLine.split(" ")
                if (parts.size < 2) return
                val requestPath = parts[1]
                val path = requestPath.substringBefore("?")
                val requestUri = Uri.parse(
                    if (requestPath.startsWith("/")) requestPath else "/$requestPath"
                )
                while (true) {
                    val line = reader.readLine() ?: break
                    if (line.isEmpty()) break
                }
                when {
                    path == "/blocked.js" -> respondAsset(client, "block_page/blocked.js", "application/javascript")
                    path == "/blocked-icon" -> respondBrowserIcon(client, requestUri.getQueryParameter("pkg"))
                    path == "/blocked" || path == "/" -> respondAsset(client, "block_page/blocked.html", "text/html; charset=utf-8")
                    else -> respondNotFound(client)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Block page request failed", e)
        } finally {
            try {
                client.close()
            } catch (_: Exception) {
                // Ignore close failures.
            }
        }
    }

    private fun respondBrowserIcon(client: Socket, packageName: String?) {
        val pkg = packageName?.trim().orEmpty()
        if (pkg.isEmpty()) {
            respondNotFound(client)
            return
        }
        val bytes = loadAppIconPng(pkg)
        if (bytes == null) {
            respondNotFound(client)
            return
        }
        writeResponse(client.getOutputStream(), 200, "image/png", bytes)
    }

    private fun loadAppIconPng(packageName: String): ByteArray? {
        return try {
            val drawable = context.packageManager.getApplicationIcon(packageName)
            val sizePx = (64 * context.resources.displayMetrics.density).toInt().coerceAtLeast(64)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            drawable.setBounds(0, 0, sizePx, sizePx)
            drawable.draw(canvas)
            ByteArrayOutputStream().use { stream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
                stream.toByteArray()
            }
        } catch (e: PackageManager.NameNotFoundException) {
            Log.w(TAG, "Browser icon not found for $packageName", e)
            null
        } catch (e: Exception) {
            Log.w(TAG, "Failed to render browser icon for $packageName", e)
            null
        }
    }

    private fun respondAsset(client: Socket, assetPath: String, contentType: String) {
        val bytes = context.assets.open(assetPath).use { it.readBytes() }
        writeResponse(client.getOutputStream(), 200, contentType, bytes)
    }

    private fun respondNotFound(client: Socket) {
        writeResponse(client.getOutputStream(), 404, "text/plain", "Not found")
    }

    private fun writeResponse(
        output: OutputStream,
        status: Int,
        contentType: String,
        body: String
    ) {
        writeResponse(output, status, contentType, body.toByteArray(StandardCharsets.UTF_8))
    }

    private fun writeResponse(
        output: OutputStream,
        status: Int,
        contentType: String,
        body: ByteArray
    ) {
        val statusText = if (status == 200) "OK" else "Not Found"
        val header = (
            "HTTP/1.1 $status $statusText\r\n" +
                "Content-Type: $contentType\r\n" +
                "Content-Length: ${body.size}\r\n" +
                "Connection: close\r\n" +
                "Cache-Control: no-store\r\n" +
                "\r\n"
            ).toByteArray(StandardCharsets.UTF_8)
        output.write(header)
        output.write(body)
        output.flush()
    }

    companion object {
        private const val TAG = "LocalBlockPageServer"
        const val HOST = "127.0.0.1"
    }
}
