package com.voterapp.union

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var printWebView: WebView? = null
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var errorView: View
    private lateinit var btnRetry: Button

    private lateinit var assetLoader: WebViewAssetLoader

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var doubleBackToExitPressedOnce = false
    private var pendingApkFile: File? = null
    private var notifiedUpdateVersion: String? = null

    // Built-In In-App APK Download Manager state
    private val activeDownloadCancelled = AtomicBoolean(false)
    private var activeDownloadThread: Thread? = null
    @Volatile private var dlStatus: String = "idle"
    @Volatile private var dlVersion: String = ""
    @Volatile private var dlUrl: String = ""
    @Volatile private var dlBytes: Long = 0L
    @Volatile private var dlTotal: Long = 0L
    @Volatile private var dlPercent: Int = 0
    @Volatile private var dlSpeedBps: Long = 0L
    @Volatile private var dlError: String = ""
    @Volatile private var dlFileName: String = ""

    // Standard SPP UUID for Bluetooth Thermal Printers
    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private var activeBtSocket: BluetoothSocket? = null
    private var activeBtDevice: BluetoothDevice? = null

    // WebViewAssetLoader serves assets from secure HTTPS origin to enable ES Modules & CORS without blank screen
    private val localAppUrl = "https://appassets.androidplatform.net/assets/public/index.html"
    private val defaultLiveUrl = "https://rahatsharif10448.github.io/voter-apps/"

    // File Chooser Launcher for uploads
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val dataIntent = result.data
            val singleUri = dataIntent?.data
            val clipData = dataIntent?.clipData
            val results: Array<Uri>? = when {
                singleUri != null -> arrayOf(singleUri)
                clipData != null -> {
                    val count = clipData.itemCount
                    Array(count) { i -> clipData.getItemAt(i).uri }
                }
                else -> null
            }
            fileChooserCallback?.onReceiveValue(results)
        } else {
            fileChooserCallback?.onReceiveValue(null)
        }
        fileChooserCallback = null
    }

    // Bluetooth, Location & Notification Permissions Launcher
    private val runtimePermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.entries.all { it.value }
        if (allGranted) {
            Log.d("VoterApp", "Runtime permissions granted.")
        } else {
            Log.w("VoterApp", "Some runtime permissions were denied.")
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "UnspecifiedRegisterReceiverFlag")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout)
        errorView = findViewById(R.id.errorView)
        btnRetry = findViewById(R.id.btnRetry)

        // Initialize Android Jetpack WebViewAssetLoader for secure HTTPS local asset loading
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        requestRuntimePermissions()
        setupWebView()
        setupSwipeRefresh()
        setupBackNavigation()

        btnRetry.setOnClickListener {
            errorView.visibility = View.GONE
            loadTargetUrl()
        }

        loadTargetUrl()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.hasExtra("update_apk_url")) {
            Handler(Looper.getMainLooper()).postDelayed({
                webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('voter_open_update_modal'));",
                    null
                )
            }, 350)
        }
    }

    private fun requestRuntimePermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.BLUETOOTH_SCAN)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (permissionsToRequest.isNotEmpty()) {
            runtimePermissionsLauncher.launch(permissionsToRequest.toTypedArray())
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings: WebSettings = webView.settings

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        @Suppress("DEPRECATION")
        settings.allowFileAccessFromFileURLs = true
        @Suppress("DEPRECATION")
        settings.allowUniversalAccessFromFileURLs = true

        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.textZoom = 100
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        webView.overScrollMode = View.OVER_SCROLL_NEVER

        val originalUa = settings.userAgentString ?: ""
        settings.userAgentString = "$originalUa VoterAppAndroid/${getInstalledVersionName()}"

        // Expose Native JavaScript Interface
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidNative")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                Log.d("VoterAppJS", "${consoleMessage?.message()} -- Line ${consoleMessage?.lineNumber()}")
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request != null) {
                    request.grant(request.resources)
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }

                try {
                    filePickerLauncher.launch(intent)
                } catch (e: Exception) {
                    fileChooserCallback = null
                    return false
                }
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false

                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("sms:")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return true
                    } catch (e: Exception) {
                        Log.e("VoterApp", "Error opening scheme: $url", e)
                    }
                }

                if (url.endsWith(".apk") || url.contains("/releases/download/") || url.contains("/releases/latest/download/")) {
                    downloadApkAndPromptInstall(url, "latest")
                    return true
                }

                if (url.contains("console.firebase.google.com") || url.contains("accounts.google.com")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return true
                    } catch (e: Exception) {
                        Log.e("VoterApp", "Error opening browser: $url", e)
                    }
                }

                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                errorView.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
                swipeRefreshLayout.isRefreshing = false
                errorView.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    progressBar.visibility = View.GONE
                    swipeRefreshLayout.isRefreshing = false
                    val failedUrl = request.url?.toString() ?: ""
                    if (failedUrl.contains("appassets.androidplatform.net")) {
                        view?.loadUrl(defaultLiveUrl)
                    } else {
                        errorView.visibility = View.VISIBLE
                    }
                }
            }
        }
    }

    private fun checkLocalAssetExists(): Boolean {
        return try {
            assets.open("public/index.html").close()
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun loadTargetUrl() {
        if (checkLocalAssetExists()) {
            webView.loadUrl(localAppUrl)
        } else {
            webView.loadUrl(defaultLiveUrl)
        }
    }

    private fun setupSwipeRefresh() {
        // Pull-down-to-refresh disabled so swiping down while scrolling never reloads the app
        swipeRefreshLayout.isEnabled = false
        swipeRefreshLayout.isRefreshing = false
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    if (doubleBackToExitPressedOnce) {
                        finish()
                    } else {
                        doubleBackToExitPressedOnce = true
                        Toast.makeText(
                            this@MainActivity,
                            getString(R.string.exit_prompt),
                            Toast.LENGTH_SHORT
                        ).show()

                        Handler(Looper.getMainLooper()).postDelayed({
                            doubleBackToExitPressedOnce = false
                        }, 2000)
                    }
                }
            }
        })
    }

    fun getInstalledVersionCode(): Long {
        return try {
            val pInfo = packageManager.getPackageInfo(packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode.toLong()
            }
        } catch (e: Exception) {
            100L
        }
    }

    fun getInstalledVersionName(): String {
        return try {
            val pInfo = packageManager.getPackageInfo(packageName, 0)
            pInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }

    /**
     * Native HTML Printing via Android PrintManager
     */
    @SuppressLint("SetJavaScriptEnabled")
    fun executeNativePrintHtml(htmlContent: String, jobTitle: String) {
        runOnUiThread {
            try {
                val pWebView = WebView(this@MainActivity)
                pWebView.settings.javaScriptEnabled = true
                pWebView.settings.allowFileAccess = true
                pWebView.settings.domStorageEnabled = true

                pWebView.webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): WebResourceResponse? {
                        val url = request?.url ?: return null
                        return assetLoader.shouldInterceptRequest(url)
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        Handler(Looper.getMainLooper()).postDelayed({
                            try {
                                val printManager = getSystemService(Context.PRINT_SERVICE) as? PrintManager
                                val adapter = pWebView.createPrintDocumentAdapter(jobTitle)
                                val attributes = PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .build()
                                printManager?.print(jobTitle, adapter, attributes)
                            } catch (e: Exception) {
                                Log.e("VoterApp", "PrintManager error", e)
                                Toast.makeText(this@MainActivity, "প্রিন্ট সার্ভিস চালু করা যায়নি", Toast.LENGTH_SHORT).show()
                            }
                        }, 350)
                    }
                }

                printWebView = pWebView
                pWebView.loadDataWithBaseURL(
                    "https://appassets.androidplatform.net/assets/public/",
                    htmlContent,
                    "text/html",
                    "UTF-8",
                    null
                )
            } catch (e: Exception) {
                Log.e("VoterApp", "executeNativePrintHtml failed", e)
            }
        }
    }

    /**
     * Auto-detect Paired Bluetooth Thermal Printer from Phone Settings
     */
    @SuppressLint("MissingPermission")
    fun findPairedThermalPrinter(autoConnectSocket: Boolean): String {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
            ) {
                return ""
            }

            @Suppress("DEPRECATION")
            val adapter: BluetoothAdapter = BluetoothAdapter.getDefaultAdapter() ?: return ""
            if (!adapter.isEnabled) return ""

            val bondedSet = adapter.bondedDevices
            if (bondedSet == null || bondedSet.isEmpty()) return ""
            val bondedList: List<BluetoothDevice> = bondedSet.toList()

            val printerKeywords = listOf(
                "mtp", "pt-", "rpp", "pos", "printer", "thermal", "xp-", "zj-", "bt-", "innerprinter", "bluetooth", "58", "80"
            )

            var candidate: BluetoothDevice? = null
            for (dev in bondedList) {
                val devName = (dev.name ?: "").lowercase()
                for (kw in printerKeywords) {
                    if (devName.contains(kw)) {
                        candidate = dev
                        break
                    }
                }
                if (candidate != null) break
            }
            if (candidate == null && bondedList.size == 1) {
                candidate = bondedList[0]
            }

            val target: BluetoothDevice = candidate ?: return ""

            if (autoConnectSocket) {
                try {
                    val existingSocket = activeBtSocket
                    val existingDevice = activeBtDevice
                    if (existingSocket == null || !existingSocket.isConnected || existingDevice?.address != target.address) {
                        try {
                            existingSocket?.close()
                        } catch (ignored: Exception) {}
                        val newSock: BluetoothSocket? = target.createRfcommSocketToServiceRecord(sppUuid)
                        newSock?.connect()
                        activeBtSocket = newSock
                        activeBtDevice = target
                    }
                } catch (e: Exception) {
                    activeBtDevice = target
                }
            }

            val json = JSONObject()
            json.put("success", true)
            json.put("name", target.name ?: "Bluetooth Printer")
            json.put("address", target.address ?: "")
            return json.toString()
        } catch (e: Exception) {
            Log.w("VoterApp", "findPairedThermalPrinter error", e)
            return ""
        }
    }

    @SuppressLint("MissingPermission")
    fun sendEscPosOverBluetooth(base64Payload: String, targetAddress: String): Boolean {
        return try {
            val bytes = Base64.decode(base64Payload, Base64.DEFAULT)
            @Suppress("DEPRECATION")
            val adapter: BluetoothAdapter = BluetoothAdapter.getDefaultAdapter() ?: return false
            if (!adapter.isEnabled) return false

            val bondedSet = adapter.bondedDevices
            val bondedList: List<BluetoothDevice> = bondedSet?.toList() ?: emptyList()

            var matchedDevice: BluetoothDevice? = null
            for (dev in bondedList) {
                if (dev.address == targetAddress) {
                    matchedDevice = dev
                    break
                }
            }

            val fallbackFirst: BluetoothDevice? = if (bondedList.isNotEmpty()) bondedList[0] else null
            val device: BluetoothDevice = matchedDevice
                ?: activeBtDevice
                ?: fallbackFirst
                ?: return false

            var currentSocket: BluetoothSocket? = activeBtSocket
            val currentDevice: BluetoothDevice? = activeBtDevice
            if (currentSocket == null || !currentSocket.isConnected || currentDevice?.address != device.address) {
                try {
                    currentSocket?.close()
                } catch (ignored: Exception) {}
                val createdSocket: BluetoothSocket = device.createRfcommSocketToServiceRecord(sppUuid) ?: return false
                adapter.cancelDiscovery()
                createdSocket.connect()
                activeBtSocket = createdSocket
                activeBtDevice = device
                currentSocket = createdSocket
            }

            val finalSocket: BluetoothSocket = currentSocket ?: return false
            val out = finalSocket.outputStream ?: return false
            val chunkSize = 512
            var offset = 0
            while (offset < bytes.size) {
                val end = minOf(offset + chunkSize, bytes.size)
                out.write(bytes, offset, end - offset)
                out.flush()
                offset = end
                Thread.sleep(15)
            }
            true
        } catch (e: Exception) {
            Log.e("VoterApp", "sendEscPosOverBluetooth error", e)
            try {
                activeBtSocket?.close()
            } catch (ignored: Exception) {}
            activeBtSocket = null
            false
        }
    }

    /**
     * Show Android System Notification when a new APK Update is available
     */
    fun postUpdateSystemNotification(versionName: String, apkUrl: String) {
        if (notifiedUpdateVersion == versionName) return
        notifiedUpdateVersion = versionName

        try {
            val channelId = "voter_app_updates"
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    channelId,
                    "অ্যাপ আপডেট নোটিফিকেশন",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "ইউনিয়ন ভোটার অ্যাপের নতুন আপডেট আসলে নোটিফিকেশন দেখায়"
                }
                nm.createNotificationChannel(channel)
            }

            val openIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("update_apk_url", apkUrl)
            }
            val pendingIntent = PendingIntent.getActivity(
                this,
                2026,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("🚀 অ্যাপের নতুন আপডেট এসেছে (v$versionName)")
                .setContentText("নতুন ফিচার পেতে অ্যাপের ভেতরে ঢুকে এখনই আপডেট করুন।")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            nm.notify(2026, notification)
        } catch (e: Exception) {
            Log.w("VoterApp", "Failed to show update notification", e)
        }
    }

    private fun buildDownloadStateJson(): String {
        val json = JSONObject()
        json.put("status", dlStatus)
        json.put("versionName", dlVersion)
        json.put("apkUrl", dlUrl)
        json.put("downloadedBytes", dlBytes)
        json.put("totalBytes", dlTotal)
        json.put("percent", dlPercent)
        json.put("speedBps", dlSpeedBps)
        json.put("errorMessage", dlError)
        json.put("fileName", dlFileName)
        return json.toString()
    }

    private fun emitDownloadProgressToWeb() {
        val payload = buildDownloadStateJson()
        val quoted = JSONObject.quote(payload)
        runOnUiThread {
            try {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('voter_apk_download_progress', { detail: JSON.parse($quoted) }));",
                    null
                )
            } catch (ignored: Exception) {}
        }
    }

    private fun resolveApkFileForVersion(versionName: String): File {
        val safeVer = versionName.replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "latest" }
        val dir: File = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
        if (!dir.exists()) dir.mkdirs()
        return File(dir, "Union-Voter-App-v$safeVer.apk")
    }

    private fun hasExistingApkForVersion(versionName: String): Boolean {
        return try {
            val file = resolveApkFileForVersion(versionName)
            file.exists() && file.length() > 100_000L
        } catch (e: Exception) {
            false
        }
    }

    private fun cancelInAppApkDownload() {
        activeDownloadCancelled.set(true)
        if (dlStatus == "downloading") {
            dlStatus = "cancelled"
            dlSpeedBps = 0L
            emitDownloadProgressToWeb()
        }
    }

    /**
     * Built-in In-App APK Download Manager using HttpURLConnection (follows GitHub CDN redirects cleanly)
     */
    fun downloadApkAndPromptInstall(apkUrl: String, versionName: String) {
        if (dlStatus == "downloading" && activeDownloadThread?.isAlive == true) {
            emitDownloadProgressToWeb()
            return
        }

        val targetFile = resolveApkFileForVersion(versionName)
        val tempFile = File(targetFile.parentFile, "${targetFile.name}.part")
        pendingApkFile = targetFile

        activeDownloadCancelled.set(false)
        dlStatus = "downloading"
        dlVersion = versionName
        dlUrl = apkUrl
        dlBytes = 0L
        dlTotal = 0L
        dlPercent = 0
        dlSpeedBps = 0L
        dlError = ""
        dlFileName = targetFile.name
        emitDownloadProgressToWeb()

        val worker = Thread {
            var connection: HttpURLConnection? = null
            var input: InputStream? = null
            var output: FileOutputStream? = null
            try {
                if (tempFile.exists()) tempFile.delete()

                var currentUrl = URL(apkUrl)
                var redirects = 0
                var conn: HttpURLConnection
                while (true) {
                    conn = (currentUrl.openConnection() as HttpURLConnection).apply {
                        instanceFollowRedirects = false
                        connectTimeout = 20000
                        readTimeout = 30000
                        setRequestProperty("User-Agent", "VoterAppAndroid/${getInstalledVersionName()}")
                        setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream, */*")
                    }
                    conn.connect()
                    val code = conn.responseCode
                    if (code == HttpURLConnection.HTTP_MOVED_PERM ||
                        code == HttpURLConnection.HTTP_MOVED_TEMP ||
                        code == HttpURLConnection.HTTP_SEE_OTHER ||
                        code == 307 ||
                        code == 308
                    ) {
                        val location = conn.getHeaderField("Location")
                        conn.disconnect()
                        if (location.isNullOrBlank() || redirects >= 8) {
                            throw Exception("রিডাইরেক্ট লিঙ্ক পাওয়া যায়নি ($code)")
                        }
                        currentUrl = URL(currentUrl, location)
                        redirects++
                        continue
                    }
                    break
                }

                connection = conn
                if (conn.responseCode !in 200..299) {
                    throw Exception("সার্ভার ত্রুটি (HTTP ${conn.responseCode})")
                }

                val contentLenHeader = conn.getHeaderField("Content-Length")?.toLongOrNull()
                val total = contentLenHeader ?: conn.contentLength.toLong().coerceAtLeast(0L)
                dlTotal = total

                input = conn.inputStream
                output = FileOutputStream(tempFile)
                val buffer = ByteArray(8192)
                var downloaded = 0L
                var lastEmitTime = System.currentTimeMillis()
                var lastSpeedCheckTime = lastEmitTime
                var bytesSinceLastSpeed = 0L

                while (true) {
                    if (activeDownloadCancelled.get()) {
                        throw InterruptedException("cancelled")
                    }
                    val read = input.read(buffer)
                    if (read == -1) break
                    output.write(buffer, 0, read)
                    downloaded += read
                    bytesSinceLastSpeed += read

                    val now = System.currentTimeMillis()
                    if (now - lastEmitTime >= 250L) {
                        val elapsedSec = ((now - lastSpeedCheckTime).coerceAtLeast(1L)) / 1000.0
                        dlSpeedBps = (bytesSinceLastSpeed / elapsedSec).toLong()
                        lastSpeedCheckTime = now
                        bytesSinceLastSpeed = 0L

                        dlBytes = downloaded
                        dlPercent = if (total > 0L) ((downloaded * 100L) / total).toInt().coerceIn(0, 99) else 0
                        emitDownloadProgressToWeb()
                        lastEmitTime = now
                    }
                }

                output.flush()
                output.close()
                output = null
                input.close()
                input = null
                conn.disconnect()
                connection = null

                if (activeDownloadCancelled.get() || downloaded <= 0L) {
                    if (tempFile.exists()) tempFile.delete()
                    dlStatus = "cancelled"
                    dlSpeedBps = 0L
                    emitDownloadProgressToWeb()
                    return@Thread
                }

                if (targetFile.exists()) targetFile.delete()
                val renamed = tempFile.renameTo(targetFile)
                if (!renamed) {
                    tempFile.copyTo(targetFile, overwrite = true)
                    tempFile.delete()
                }

                pendingApkFile = targetFile
                dlBytes = targetFile.length()
                if (dlTotal <= 0L) dlTotal = dlBytes
                dlPercent = 100
                dlSpeedBps = 0L
                dlStatus = "completed"
                dlError = ""
                emitDownloadProgressToWeb()

                runOnUiThread {
                    installDownloadedApk(targetFile)
                }
            } catch (e: InterruptedException) {
                try { tempFile.delete() } catch (ignored: Exception) {}
                dlStatus = "cancelled"
                dlSpeedBps = 0L
                dlError = ""
                emitDownloadProgressToWeb()
            } catch (e: Exception) {
                Log.e("VoterApp", "In-app APK download failed", e)
                try { tempFile.delete() } catch (ignored: Exception) {}
                dlStatus = "error"
                dlSpeedBps = 0L
                dlError = e.message ?: "ডাউনলোড ব্যর্থ হয়েছে। ইন্টারনেট পরীক্ষা করে পুনরায় চেষ্টা করুন।"
                emitDownloadProgressToWeb()
            } finally {
                try { output?.close() } catch (ignored: Exception) {}
                try { input?.close() } catch (ignored: Exception) {}
                try { connection?.disconnect() } catch (ignored: Exception) {}
            }
        }

        activeDownloadThread = worker
        worker.start()
    }

    private fun canInstallUnknownApps(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    private fun openUnknownAppInstallSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val intent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:$packageName")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
                Toast.makeText(
                    this,
                    "এই অ্যাপ থেকে সরাসরি আপডেট করতে 'Allow from this source' চালু করুন।",
                    Toast.LENGTH_LONG
                ).show()
            } catch (e: Exception) {
                Log.w("VoterApp", "Could not open unknown app sources settings", e)
            }
        }
    }

    private fun installDownloadedApk(apkFile: File) {
        try {
            if (!canInstallUnknownApps()) {
                openUnknownAppInstallSettings()
                return
            }

            val apkUri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                FileProvider.getUriForFile(
                    this,
                    "${applicationContext.packageName}.fileprovider",
                    apkFile
                )
            } else {
                Uri.fromFile(apkFile)
            }

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(installIntent)
        } catch (e: Exception) {
            Log.e("VoterApp", "Failed to launch APK installer", e)
            Toast.makeText(
                this,
                "ডাউনলোড সম্পন্ন হয়েছে! ফাইল ম্যানেজারের Download ফোল্ডার থেকে ইন্সটল করুন।",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onDestroy() {
        activeDownloadCancelled.set(true)
        try {
            activeBtSocket?.close()
        } catch (ignored: Exception) {}
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    /**
     * Native JavaScript Interface exposed to Web code as `window.AndroidNative`
     */
    inner class WebAppInterface(private val context: Context) {
        @JavascriptInterface
        fun showToast(message: String) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }

        @JavascriptInterface
        fun vibrate(durationMs: Long) {
            @Suppress("DEPRECATION")
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(durationMs)
                }
            }
        }

        @JavascriptInterface
        fun getAndroidVersion(): String {
            return "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
        }

        @JavascriptInterface
        fun getAppVersionCode(): Int {
            return getInstalledVersionCode().toInt()
        }

        @JavascriptInterface
        fun getAppVersionName(): String {
            return getInstalledVersionName()
        }

        @JavascriptInterface
        fun printHtml(htmlContent: String, jobName: String) {
            executeNativePrintHtml(htmlContent, jobName)
        }

        @JavascriptInterface
        fun getPairedPrinterInfo(): String {
            return findPairedThermalPrinter(false)
        }

        @JavascriptInterface
        fun connectPairedPrinter(): String {
            return findPairedThermalPrinter(true)
        }

        @JavascriptInterface
        fun disconnectPrinter() {
            try {
                activeBtSocket?.close()
            } catch (ignored: Exception) {}
            activeBtSocket = null
        }

        @JavascriptInterface
        fun printEscPosBase64(base64Data: String, address: String): Boolean {
            return sendEscPosOverBluetooth(base64Data, address)
        }

        @JavascriptInterface
        fun showUpdateNotification(versionName: String, apkUrl: String) {
            postUpdateSystemNotification(versionName, apkUrl)
        }

        @JavascriptInterface
        fun downloadAndInstallApk(apkUrl: String, versionName: String) {
            downloadApkAndPromptInstall(apkUrl, versionName)
        }

        @JavascriptInterface
        fun cancelApkDownload() {
            cancelInAppApkDownload()
        }

        @JavascriptInterface
        fun getApkDownloadState(): String {
            return buildDownloadStateJson()
        }

        @JavascriptInterface
        fun hasDownloadedApk(versionName: String): Boolean {
            return hasExistingApkForVersion(versionName)
        }

        @JavascriptInterface
        fun installDownloadedApk(versionName: String): Boolean {
            val target = resolveApkFileForVersion(versionName)
            val fallback = pendingApkFile
            val fileToInstall = when {
                target.exists() && target.length() > 100_000L -> target
                fallback != null && fallback.exists() && fallback.length() > 100_000L -> fallback
                else -> null
            } ?: return false

            runOnUiThread {
                this@MainActivity.installDownloadedApk(fileToInstall)
            }
            return true
        }

        @JavascriptInterface
        fun canInstallPackages(): Boolean {
            return canInstallUnknownApps()
        }

        @JavascriptInterface
        fun openInstallPermissionSettings() {
            runOnUiThread {
                openUnknownAppInstallSettings()
            }
        }
    }
}
