package com.voterapp.union

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.ContentValues
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
import android.provider.MediaStore
import android.provider.Settings
import android.speech.RecognizerIntent
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
import org.json.JSONArray
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
    private val btLock = Any()
    private var activeBtSocket: BluetoothSocket? = null
    private var activeBtDevice: BluetoothDevice? = null

    // WebViewAssetLoader serves assets from secure HTTPS origin to enable ES Modules & CORS without blank screen
    private val localAppUrl = "https://appassets.androidplatform.net/assets/public/index.html"
    private val defaultLiveUrl = "https://rahatshari.github.io/hoglabunia-union-voter/"

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

    // Native Android Voice Search Launcher (works reliably inside WebView for Bengali bn-BD)
    private val voiceRecognitionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        try {
            if (result.resultCode == RESULT_OK) {
                val matches = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                val spokenText = matches?.firstOrNull()?.trim() ?: ""
                if (spokenText.isNotEmpty()) {
                    val payload = JSONObject().put("text", spokenText).toString()
                    val quoted = JSONObject.quote(payload)
                    webView.post {
                        webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('voter_native_voice_result', { detail: JSON.parse($quoted) }));",
                            null
                        )
                    }
                    return@registerForActivityResult
                }
            }
            val errPayload = JSONObject().put("message", "কোনো কথা শোনা যায়নি, আবার চেষ্টা করুন").toString()
            val quotedErr = JSONObject.quote(errPayload)
            webView.post {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('voter_native_voice_error', { detail: JSON.parse($quotedErr) }));",
                    null
                )
            }
        } catch (e: Exception) {
            Log.e("VoterApp", "voiceRecognitionLauncher error", e)
        }
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
        try {
            if (::webView.isInitialized) {
                webView.post {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new Event('voter_bt_permissions_updated'));",
                        null
                    )
                }
            }
        } catch (ignored: Exception) {}
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

                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("sms:") || url.startsWith("whatsapp:")) {
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

                if (url.contains("wa.me") || url.contains("api.whatsapp.com") || url.contains("console.firebase.google.com") || url.contains("accounts.google.com")) {
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
     * Resolve BluetoothAdapter safely across Android versions (API 23..35+)
     */
    private fun getBluetoothAdapter(): BluetoothAdapter? {
        return try {
            val manager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            @Suppress("DEPRECATION")
            manager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
        } catch (e: Exception) {
            Log.w("VoterApp", "getBluetoothAdapter error", e)
            null
        }
    }

    private fun hasBluetoothConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun isLikelyThermalPrinterName(rawName: String): Boolean {
        val devName = rawName.lowercase()
        val printerKeywords = listOf(
            "mtp", "pt-", "rpp", "pos", "printer", "thermal", "xp-", "zj-",
            "bt-", "innerprinter", "bluetooth", "58", "80", "goojprt", "hoin",
            "nyear", "peripage", "phomemo", "bixolon", "sewoo", "sprt", "sunmi",
            "gp-", "p58", "c58", "m58", "k58", "mht", "hprt", "gprinter",
            "rongta", "print", "mini", "mpt", "rp58", "rp80", "mp58", "mp80"
        )
        for (kw in printerKeywords) {
            if (devName.contains(kw)) return true
        }
        return false
    }

    @SuppressLint("MissingPermission")
    private fun buildDevicesJsonArray(bondedList: List<BluetoothDevice>): JSONArray {
        val sorted = bondedList.sortedWith(
            compareByDescending<BluetoothDevice> { isLikelyThermalPrinterName(it.name ?: "") }
                .thenBy { (it.name ?: "").lowercase() }
        )
        val arr = JSONArray()
        for (dev in sorted) {
            val item = JSONObject()
            val devName = dev.name ?: "Bluetooth Device"
            item.put("name", devName)
            item.put("address", dev.address ?: "")
            item.put("isLikelyPrinter", isLikelyThermalPrinterName(devName))
            arr.put(item)
        }
        return arr
    }

    /**
     * Establish RFCOMM SPP connection with 3-tier fallback:
     * 1. Standard secure SPP socket
     * 2. Insecure SPP socket (required by many 58mm thermal printers on Android 10-15)
     * 3. Reflection channel-1 RFCOMM socket fallback
     */
    @SuppressLint("MissingPermission")
    private fun connectRfcommSocket(device: BluetoothDevice, adapter: BluetoothAdapter): BluetoothSocket {
        try {
            adapter.cancelDiscovery()
        } catch (ignored: Exception) {}

        var lastError: Exception? = null

        // Attempt 1: Standard Secure RFCOMM SPP
        var secureSock: BluetoothSocket? = null
        try {
            secureSock = device.createRfcommSocketToServiceRecord(sppUuid)
            secureSock.connect()
            return secureSock
        } catch (e: Exception) {
            lastError = e
            try {
                secureSock?.close()
            } catch (ignored: Exception) {}
            Log.w("VoterApp", "Secure RFCOMM connect failed, trying insecure fallback: ${e.message}")
        }

        // Attempt 2: Insecure RFCOMM SPP
        var insecureSock: BluetoothSocket? = null
        try {
            insecureSock = device.createInsecureRfcommSocketToServiceRecord(sppUuid)
            insecureSock.connect()
            return insecureSock
        } catch (e: Exception) {
            lastError = e
            try {
                insecureSock?.close()
            } catch (ignored: Exception) {}
            Log.w("VoterApp", "Insecure RFCOMM connect failed, trying channel-1 reflection: ${e.message}")
        }

        // Attempt 3: Reflection RFCOMM Channel 1
        var fallbackSock: BluetoothSocket? = null
        try {
            val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
            fallbackSock = method.invoke(device, 1) as BluetoothSocket
            fallbackSock.connect()
            return fallbackSock
        } catch (e: Exception) {
            lastError = e
            try {
                fallbackSock?.close()
            } catch (ignored: Exception) {}
            Log.e("VoterApp", "All RFCOMM connection methods failed for ${device.address}", e)
        }

        throw lastError ?: RuntimeException("Unable to open Bluetooth RFCOMM socket")
    }

    /**
     * Open Android System Bluetooth Settings so user can turn on BT or pair a printer
     */
    fun openBluetoothSettingsScreen() {
        try {
            val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e("VoterApp", "Failed to open Bluetooth settings", e)
            Toast.makeText(this, "ফোনের Settings > Bluetooth চালু করুন", Toast.LENGTH_LONG).show()
        }
    }

    /**
     * List all paired Bluetooth devices with detailed status & errorCode for JS UI
     */
    @SuppressLint("MissingPermission")
    fun getPairedBluetoothDevicesJson(): String {
        val json = JSONObject()
        try {
            if (!hasBluetoothConnectPermission()) {
                json.put("success", false)
                json.put("errorCode", "PERMISSION_DENIED")
                json.put("bluetoothEnabled", false)
                json.put("permissionGranted", false)
                json.put("error", "ব্লুটুথ অনুমতি (Nearby Devices) দেওয়া নেই। নিচের বাটনে চাপ দিয়ে অনুমতি দিন।")
                json.put("devices", JSONArray())
                return json.toString()
            }

            val adapter = getBluetoothAdapter()
            if (adapter == null) {
                json.put("success", false)
                json.put("errorCode", "NO_ADAPTER")
                json.put("bluetoothEnabled", false)
                json.put("permissionGranted", true)
                json.put("error", "এই ফোনে ব্লুটুথ হার্ডওয়্যার পাওয়া যায়নি।")
                json.put("devices", JSONArray())
                return json.toString()
            }

            if (!adapter.isEnabled) {
                json.put("success", false)
                json.put("errorCode", "BLUETOOTH_DISABLED")
                json.put("bluetoothEnabled", false)
                json.put("permissionGranted", true)
                json.put("error", "ফোনের ব্লুটুথ বন্ধ আছে। আগে ফোনের ব্লুটুথ চালু (ON) করুন।")
                json.put("devices", JSONArray())
                return json.toString()
            }

            val bondedList: List<BluetoothDevice> = adapter.bondedDevices?.toList() ?: emptyList()
            if (bondedList.isEmpty()) {
                json.put("success", false)
                json.put("errorCode", "NO_PAIRED_DEVICES")
                json.put("bluetoothEnabled", true)
                json.put("permissionGranted", true)
                json.put("error", "কোনো ব্লুটুথ প্রিন্টার পেয়ার করা নেই। ফোনের ব্লুটুথ সেটিংস থেকে প্রিন্টারটি পেয়ার (Pair) করুন।")
                json.put("devices", JSONArray())
                return json.toString()
            }

            json.put("success", true)
            json.put("errorCode", "")
            json.put("bluetoothEnabled", true)
            json.put("permissionGranted", true)
            json.put("devices", buildDevicesJsonArray(bondedList))
            return json.toString()
        } catch (e: Exception) {
            Log.e("VoterApp", "getPairedBluetoothDevicesJson error", e)
            json.put("success", false)
            json.put("errorCode", "UNKNOWN_ERROR")
            json.put("bluetoothEnabled", false)
            json.put("permissionGranted", hasBluetoothConnectPermission())
            json.put("error", "ব্লুটুথ তালিকা লোড করা যায়নি: ${e.message ?: "অজানা ত্রুটি"}")
            json.put("devices", JSONArray())
            return json.toString()
        }
    }

    /**
     * Connect directly to a specific paired Bluetooth printer by MAC address
     */
    @SuppressLint("MissingPermission")
    fun connectBluetoothPrinterByAddress(targetAddress: String): String {
        val json = JSONObject()
        synchronized(btLock) {
            try {
                if (!hasBluetoothConnectPermission()) {
                    json.put("success", false)
                    json.put("errorCode", "PERMISSION_DENIED")
                    json.put("error", "ব্লুটুথ অনুমতি (Nearby Devices) দেওয়া নেই।")
                    return json.toString()
                }

                val adapter = getBluetoothAdapter()
                if (adapter == null) {
                    json.put("success", false)
                    json.put("errorCode", "NO_ADAPTER")
                    json.put("error", "এই ফোনে ব্লুটুথ সাপোর্ট পাওয়া যায়নি।")
                    return json.toString()
                }

                if (!adapter.isEnabled) {
                    json.put("success", false)
                    json.put("errorCode", "BLUETOOTH_DISABLED")
                    json.put("error", "ফোনের ব্লুটুথ বন্ধ আছে। আগে ব্লুটুথ চালু (ON) করুন।")
                    return json.toString()
                }

                val bondedList: List<BluetoothDevice> = adapter.bondedDevices?.toList() ?: emptyList()
                var targetDevice: BluetoothDevice? = null
                for (dev in bondedList) {
                    if (dev.address.equals(targetAddress, ignoreCase = true)) {
                        targetDevice = dev
                        break
                    }
                }
                if (targetDevice == null && targetAddress.isNotBlank()) {
                    try {
                        targetDevice = adapter.getRemoteDevice(targetAddress)
                    } catch (ignored: Exception) {}
                }

                if (targetDevice == null) {
                    json.put("success", false)
                    json.put("errorCode", "DEVICE_NOT_FOUND")
                    json.put("error", "নির্বাচিত ব্লুটুথ প্রিন্টারটি পেয়ার তালিকায় পাওয়া যায়নি।")
                    return json.toString()
                }

                val existingSocket = activeBtSocket
                val existingDevice = activeBtDevice
                if (existingSocket == null || !existingSocket.isConnected || !existingDevice?.address.equals(targetDevice.address, ignoreCase = true)) {
                    try {
                        existingSocket?.close()
                    } catch (ignored: Exception) {}
                    activeBtSocket = null

                    val newSock = connectRfcommSocket(targetDevice, adapter)
                    activeBtSocket = newSock
                    activeBtDevice = targetDevice
                }

                json.put("success", true)
                json.put("name", targetDevice.name ?: "Bluetooth Printer")
                json.put("address", targetDevice.address ?: targetAddress)
                return json.toString()
            } catch (e: Exception) {
                Log.e("VoterApp", "connectBluetoothPrinterByAddress error", e)
                try {
                    activeBtSocket?.close()
                } catch (ignored: Exception) {}
                activeBtSocket = null
                json.put("success", false)
                json.put("errorCode", "CONNECT_FAILED")
                json.put("error", "প্রিন্টারে কানেক্ট করা যায়নি। প্রিন্টারটি অন আছে ও ফোনের কাছাকাছি আছে কিনা দেখুন।")
                return json.toString()
            }
        }
    }

    /**
     * Auto-detect Paired Bluetooth Thermal Printer from Phone Settings
     */
    @SuppressLint("MissingPermission")
    fun findPairedThermalPrinter(autoConnectSocket: Boolean): String {
        val json = JSONObject()
        try {
            if (!hasBluetoothConnectPermission()) {
                json.put("success", false)
                json.put("errorCode", "PERMISSION_DENIED")
                json.put("error", "ব্লুটুথ অনুমতি (Nearby Devices) দেওয়া নেই।")
                return json.toString()
            }

            val adapter = getBluetoothAdapter()
            if (adapter == null) {
                json.put("success", false)
                json.put("errorCode", "NO_ADAPTER")
                json.put("error", "এই ফোনে ব্লুটুথ পাওয়া যায়নি।")
                return json.toString()
            }
            if (!adapter.isEnabled) {
                json.put("success", false)
                json.put("errorCode", "BLUETOOTH_DISABLED")
                json.put("error", "ফোনের ব্লুটুথ বন্ধ আছে। আগে ব্লুটুথ চালু (ON) করুন।")
                return json.toString()
            }

            val bondedList: List<BluetoothDevice> = adapter.bondedDevices?.toList() ?: emptyList()
            if (bondedList.isEmpty()) {
                json.put("success", false)
                json.put("errorCode", "NO_PAIRED_DEVICES")
                json.put("error", "কোনো ব্লুটুথ প্রিন্টার পেয়ার করা নেই। ফোনের ব্লুটুথ সেটিংস থেকে প্রিন্টারটি পেয়ার করুন।")
                return json.toString()
            }

            var candidate: BluetoothDevice? = null
            for (dev in bondedList) {
                if (isLikelyThermalPrinterName(dev.name ?: "")) {
                    candidate = dev
                    break
                }
            }
            if (candidate == null && bondedList.size == 1) {
                candidate = bondedList[0]
            }

            val target = candidate
            if (target == null) {
                json.put("success", false)
                json.put("errorCode", "MULTIPLE_DEVICES_SELECT_REQUIRED")
                json.put("error", "একাধিক ব্লুটুথ ডিভাইস পেয়ার করা আছে। তালিকা থেকে আপনার প্রিন্টারটি সিলেক্ট করুন।")
                json.put("devices", buildDevicesJsonArray(bondedList))
                return json.toString()
            }

            if (autoConnectSocket) {
                return connectBluetoothPrinterByAddress(target.address ?: "")
            }

            json.put("success", true)
            json.put("name", target.name ?: "Bluetooth Printer")
            json.put("address", target.address ?: "")
            return json.toString()
        } catch (e: Exception) {
            Log.w("VoterApp", "findPairedThermalPrinter error", e)
            json.put("success", false)
            json.put("errorCode", "UNKNOWN_ERROR")
            json.put("error", "ব্লুটুথ প্রিন্টার খোঁজায় সমস্যা হয়েছে।")
            return json.toString()
        }
    }

    @SuppressLint("MissingPermission")
    fun sendEscPosOverBluetoothDetailed(base64Payload: String, targetAddress: String): String {
        val json = JSONObject()
        synchronized(btLock) {
            try {
                if (!hasBluetoothConnectPermission()) {
                    json.put("success", false)
                    json.put("errorCode", "PERMISSION_DENIED")
                    json.put("error", "ব্লুটুথ অনুমতি (Nearby Devices) দেওয়া নেই।")
                    return json.toString()
                }

                val bytes = Base64.decode(base64Payload, Base64.DEFAULT)
                val adapter = getBluetoothAdapter()
                if (adapter == null) {
                    json.put("success", false)
                    json.put("errorCode", "NO_ADAPTER")
                    json.put("error", "এই ফোনে ব্লুটুথ হার্ডওয়্যার পাওয়া যায়নি।")
                    return json.toString()
                }
                if (!adapter.isEnabled) {
                    json.put("success", false)
                    json.put("errorCode", "BLUETOOTH_DISABLED")
                    json.put("error", "ফোনের ব্লুটুথ বন্ধ আছে। আগে ব্লুটুথ চালু (ON) করুন।")
                    return json.toString()
                }

                val bondedList: List<BluetoothDevice> = adapter.bondedDevices?.toList() ?: emptyList()

                var matchedDevice: BluetoothDevice? = null
                if (targetAddress.isNotBlank()) {
                    for (dev in bondedList) {
                        if (dev.address.equals(targetAddress, ignoreCase = true)) {
                            matchedDevice = dev
                            break
                        }
                    }
                    if (matchedDevice == null) {
                        try {
                            matchedDevice = adapter.getRemoteDevice(targetAddress)
                        } catch (ignored: Exception) {}
                    }
                }

                var likelyPrinter: BluetoothDevice? = null
                for (dev in bondedList) {
                    if (isLikelyThermalPrinterName(dev.name ?: "")) {
                        likelyPrinter = dev
                        break
                    }
                }

                val fallbackFirst: BluetoothDevice? = if (bondedList.isNotEmpty()) bondedList[0] else null
                val device: BluetoothDevice? = matchedDevice
                    ?: activeBtDevice
                    ?: likelyPrinter
                    ?: fallbackFirst

                if (device == null) {
                    json.put("success", false)
                    json.put("errorCode", "NO_PAIRED_DEVICES")
                    json.put("error", "কোনো পেয়ার করা ব্লুটুথ প্রিন্টার পাওয়া যায়নি।")
                    return json.toString()
                }

                var attempt = 0
                var lastWriteErr: Exception? = null
                while (attempt < 2) {
                    attempt++
                    try {
                        var currentSocket: BluetoothSocket? = activeBtSocket
                        val currentDevice: BluetoothDevice? = activeBtDevice
                        if (currentSocket == null || !currentSocket.isConnected || !currentDevice?.address.equals(device.address, ignoreCase = true)) {
                            try {
                                currentSocket?.close()
                            } catch (ignored: Exception) {}
                            activeBtSocket = null
                            val createdSocket = connectRfcommSocket(device, adapter)
                            activeBtSocket = createdSocket
                            activeBtDevice = device
                            currentSocket = createdSocket
                        }

                        val out = currentSocket.outputStream
                        val chunkSize = 256
                        var offset = 0
                        while (offset < bytes.size) {
                            val end = minOf(offset + chunkSize, bytes.size)
                            out.write(bytes, offset, end - offset)
                            out.flush()
                            offset = end
                            Thread.sleep(12)
                        }
                        Thread.sleep(120)

                        json.put("success", true)
                        json.put("name", device.name ?: "Bluetooth Printer")
                        json.put("address", device.address ?: "")
                        return json.toString()
                    } catch (e: Exception) {
                        lastWriteErr = e
                        Log.w("VoterApp", "Bluetooth write attempt $attempt failed: ${e.message}")
                        try {
                            activeBtSocket?.close()
                        } catch (ignored: Exception) {}
                        activeBtSocket = null
                    }
                }

                Log.e("VoterApp", "sendEscPosOverBluetoothDetailed failed after retry", lastWriteErr)
                json.put("success", false)
                json.put("errorCode", "PRINT_FAILED")
                json.put("error", "প্রিন্টারে ডাটা পাঠানো যায়নি। প্রিন্টারটি অন আছে, কাগজ আছে ও ফোনের কাছাকাছি আছে কিনা দেখুন।")
                return json.toString()
            } catch (e: Exception) {
                Log.e("VoterApp", "sendEscPosOverBluetoothDetailed error", e)
                try {
                    activeBtSocket?.close()
                } catch (ignored: Exception) {}
                activeBtSocket = null
                json.put("success", false)
                json.put("errorCode", "PRINT_FAILED")
                json.put("error", "ব্লুটুথ প্রিন্টে সমস্যা হয়েছে: ${e.message ?: "আবার চেষ্টা করুন"}")
                return json.toString()
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun sendEscPosOverBluetooth(base64Payload: String, targetAddress: String): Boolean {
        return try {
            val res = sendEscPosOverBluetoothDetailed(base64Payload, targetAddress)
            JSONObject(res).optBoolean("success", false)
        } catch (e: Exception) {
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
        return File(dir, "Hoglabunia-Voter-App-v$safeVer.apk")
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
        fun getPairedBluetoothDevices(): String {
            return getPairedBluetoothDevicesJson()
        }

        @JavascriptInterface
        fun connectPairedPrinter(): String {
            return findPairedThermalPrinter(true)
        }

        @JavascriptInterface
        fun connectPrinterByAddress(address: String): String {
            return connectBluetoothPrinterByAddress(address)
        }

        @JavascriptInterface
        fun disconnectPrinter() {
            synchronized(btLock) {
                try {
                    activeBtSocket?.close()
                } catch (ignored: Exception) {}
                activeBtSocket = null
                activeBtDevice = null
            }
        }

        @JavascriptInterface
        fun printEscPosBase64(base64Data: String, address: String): Boolean {
            return sendEscPosOverBluetooth(base64Data, address)
        }

        @JavascriptInterface
        fun printEscPosBase64Detailed(base64Data: String, address: String): String {
            return sendEscPosOverBluetoothDetailed(base64Data, address)
        }

        @JavascriptInterface
        fun openBluetoothSettings() {
            runOnUiThread {
                openBluetoothSettingsScreen()
            }
        }

        @JavascriptInterface
        fun requestBluetoothPermissions() {
            runOnUiThread {
                requestRuntimePermissions()
            }
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

        @JavascriptInterface
        fun openExternalUrl(url: String) {
            runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    Log.e("VoterApp", "openExternalUrl error: $url", e)
                    Toast.makeText(context, "লিংকটি ওপেন করা যায়নি", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun shareText(title: String, text: String) {
            runOnUiThread {
                try {
                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, title)
                        putExtra(Intent.EXTRA_TEXT, text)
                    }
                    startActivity(Intent.createChooser(sendIntent, title))
                } catch (e: Exception) {
                    Log.e("VoterApp", "shareText error", e)
                }
            }
        }

        @JavascriptInterface
        fun startVoiceRecognition(lang: String) {
            runOnUiThread {
                try {
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (lang.isNotBlank()) lang else "bn-BD")
                        putExtra(RecognizerIntent.EXTRA_PROMPT, "ভোটারের নাম, পিতা বা ক্রমিক বলুন...")
                    }
                    voiceRecognitionLauncher.launch(intent)
                } catch (e: Exception) {
                    Log.e("VoterApp", "startVoiceRecognition error", e)
                    val errPayload = JSONObject().put("message", "এই ফোনে গুগল ভয়েস সার্চ পাওয়া যায়নি").toString()
                    val quotedErr = JSONObject.quote(errPayload)
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('voter_native_voice_error', { detail: JSON.parse($quotedErr) }));",
                        null
                    )
                }
            }
        }

        @JavascriptInterface
        fun saveBase64File(base64Data: String, fileName: String, mimeType: String): Boolean {
            return try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val safeName = fileName.replace(Regex("[^\\u0980-\\u09FFa-zA-Z0-9._-]"), "_").ifBlank { "export.dat" }
                val cleanMime = mimeType.substringBefore(";").ifBlank { "application/octet-stream" }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, cleanMime)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    if (uri != null) {
                        contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                        runOnUiThread {
                            Toast.makeText(context, "ডাউনলোড ফোল্ডারে সেভ হয়েছে: $safeName", Toast.LENGTH_LONG).show()
                        }
                        return true
                    }
                }

                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                if (!dir.exists()) dir.mkdirs()
                val outFile = File(dir, safeName)
                FileOutputStream(outFile).use { it.write(bytes) }
                runOnUiThread {
                    Toast.makeText(context, "ফাইল সেভ হয়েছে: $safeName", Toast.LENGTH_LONG).show()
                }
                true
            } catch (e: Exception) {
                Log.e("VoterApp", "saveBase64File error", e)
                false
            }
        }
    }
}
