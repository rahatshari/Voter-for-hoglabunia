package com.voterapp.union

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
import android.util.Base64
import android.util.Log
import android.view.View
import android.webkit.*
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
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import org.json.JSONObject
import java.io.File
import java.util.UUID

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
    private var pendingDownloadId: Long = -1L
    private var pendingApkFile: File? = null
    private var notifiedUpdateVersion: String? = null

    // Standard SPP UUID for Bluetooth Thermal Printers
    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private var activeBtSocket: BluetoothSocket? = null
    private var activeBtDevice: BluetoothDevice? = null

    // WebViewAssetLoader serves assets from secure HTTPS origin to enable ES Modules & CORS without blank screen
    private val localAppUrl = "https://appassets.androidplatform.net/assets/public/index.html"
    private val defaultLiveUrl = "https://rahatsharif10448.github.io/voter-apps/"

    // Receiver for completed APK download -> automatic installation prompt
    private val downloadCompleteReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) ?: -1L
            if (id != -1L && id == pendingDownloadId) {
                val apkFile = pendingApkFile
                if (apkFile != null && apkFile.exists()) {
                    installDownloadedApk(apkFile)
                }
            }
        }
    }

    // File Chooser Launcher for uploads
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val intent = result.data
            val results: Array<Uri>? = when {
                intent?.data != null -> arrayOf(intent.data!!)
                intent?.clipData != null -> {
                    val count = intent.clipData!!.itemCount
                    Array(count) { i -> intent.clipData!!.getItemAt(i).uri }
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
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .build()

        // Register download completion receiver for In-App APK updates
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        ContextCompat.registerReceiver(
            this,
            downloadCompleteReceiver,
            filter,
            ContextCompat.RECEIVER_EXPORTED
        )

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

        val originalUa = settings.userAgentString
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
                request?.grant(request.resources)
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
                    val failedUrl = request.url.toString()
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
        swipeRefreshLayout.setColorSchemeResources(R.color.primary, R.color.accent)
        swipeRefreshLayout.setOnRefreshListener {
            webView.reload()
        }
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
                                val builder = PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                printManager?.print(jobTitle, adapter, builder.build())
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

            val adapter = BluetoothAdapter.getDefaultAdapter() ?: return ""
            if (!adapter.isEnabled) return ""

            val bonded = adapter.bondedDevices ?: return ""
            if (bonded.isEmpty()) return ""

            val printerKeywords = listOf(
                "mtp", "pt-", "rpp", "pos", "printer", "thermal", "xp-", "zj-", "bt-", "innerprinter", "bluetooth", "58", "80"
            )

            // Prefer devices matching thermal printer keywords, or fallback to first paired device
            var candidate: BluetoothDevice? = bonded.firstOrNull { dev ->
                val n = (dev.name ?: "").lowercase()
                printerKeywords.any { kw -> n.contains(kw) }
            }
            if (candidate == null && bonded.size == 1) {
                candidate = bonded.first()
            }

            val target = candidate ?: return ""

            if (autoConnectSocket) {
                try {
                    if (activeBtSocket == null || activeBtSocket?.isConnected != true || activeBtDevice?.address != target.address) {
                        activeBtSocket?.close()
                        val sock = target.createRfcommSocketToServiceRecord(sppUuid)
                        sock.connect()
                        activeBtSocket = sock
                        activeBtDevice = target
                    }
                } catch (e: Exception) {
                    // Socket can also connect on-demand during printEscPosBase64
                    activeBtDevice = target
                }
            }

            val json = JSONObject()
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
            val adapter = BluetoothAdapter.getDefaultAdapter() ?: return false
            if (!adapter.isEnabled) return false

            val bonded = adapter.bondedDevices ?: emptySet()
            val device: BluetoothDevice = bonded.firstOrNull { it.address == targetAddress }
                ?: activeBtDevice
                ?: bonded.firstOrNull()
                ?: return false

            var socket = activeBtSocket
            if (socket == null || !socket.isConnected || activeBtDevice?.address != device.address) {
                try {
                    socket?.close()
                } catch (ignored: Exception) {}
                socket = device.createRfcommSocketToServiceRecord(sppUuid)
                adapter.cancelDiscovery()
                socket.connect()
                activeBtSocket = socket
                activeBtDevice = device
            }

            val out = socket.outputStream
            // Write in chunks for stable thermal printer buffer handling
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
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
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

    /**
     * Download APK via DownloadManager and automatically launch Package Installer
     */
    fun downloadApkAndPromptInstall(apkUrl: String, versionName: String) {
        runOnUiThread {
            try {
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: cacheDir
                val targetFile = File(dir, "Union-Voter-App-v$versionName.apk")
                if (targetFile.exists()) {
                    targetFile.delete()
                }
                pendingApkFile = targetFile

                val request = DownloadManager.Request(Uri.parse(apkUrl))
                    .setTitle("ইউনিয়ন ভোটার তালিকা v$versionName")
                    .setDescription("নতুন ভার্সন ডাউনলোড হচ্ছে...")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationUri(Uri.fromFile(targetFile))
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)

                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                pendingDownloadId = dm.enqueue(request)

                Toast.makeText(
                    this,
                    "⬇️ নতুন আপডেট ডাউনলোড শুরু হয়েছে! শেষ হলে অটোমেটিক Install অপশন আসবে।",
                    Toast.LENGTH_LONG
                ).show()
            } catch (e: Exception) {
                Log.e("VoterApp", "DownloadManager failed, opening browser fallback", e)
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)))
                } catch (ignored: Exception) {}
            }
        }
    }

    private fun installDownloadedApk(apkFile: File) {
        try {
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
        try {
            unregisterReceiver(downloadCompleteReceiver)
        } catch (ignored: Exception) {}
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
    }
}
