package com.voterapp.union

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Vibrator
import android.os.VibrationEffect
import android.util.Log
import android.view.View
import android.webkit.*
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var errorView: View
    private lateinit var btnRetry: Button

    private lateinit var assetLoader: WebViewAssetLoader

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var doubleBackToExitPressedOnce = false

    // WebViewAssetLoader serves assets from secure HTTPS origin to enable ES Modules & CORS without blank screen
    private val localAppUrl = "https://appassets.androidplatform.net/assets/public/index.html"
    private val defaultLiveUrl = "https://rahatsharif10448.github.io/voter-apps/"

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

    // Bluetooth & Location Permissions Launcher (for Bluetooth Thermal Printer)
    private val bluetoothPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.entries.all { it.value }
        if (allGranted) {
            Log.d("VoterApp", "Bluetooth permissions granted for thermal slip printer.")
        } else {
            Log.w("VoterApp", "Some Bluetooth permissions were denied.")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
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

        requestBluetoothPermissions()
        setupWebView()
        setupSwipeRefresh()
        setupBackNavigation()

        btnRetry.setOnClickListener {
            errorView.visibility = View.GONE
            loadTargetUrl()
        }

        loadTargetUrl()
    }

    private fun requestBluetoothPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ Bluetooth runtime permissions
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.BLUETOOTH_SCAN)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
        } else {
            // Older Android Bluetooth & Location requirements
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        if (permissionsToRequest.isNotEmpty()) {
            bluetoothPermissionsLauncher.launch(permissionsToRequest.toTypedArray())
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings: WebSettings = webView.settings

        // Enable JavaScript and modern HTML5 APIs
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

        // Responsive text zoom matching device display scale
        settings.textZoom = 100

        // Allow mixed content for HTTP assets if any
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

        // Cache mode for offline operation
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // Modern User Agent
        val originalUa = settings.userAgentString
        settings.userAgentString = "$originalUa VoterAppAndroid/1.0.0"

        // JavaScript Interface for Native feedback
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidNative")

        // Setup WebChromeClient
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
                Log.d("VoterAppJS", "${consoleMessage?.message()} -- From line ${consoleMessage?.lineNumber()} of ${consoleMessage?.sourceId()}")
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                // Grant Web Bluetooth / Audio permissions requested by page
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

        // Setup WebViewClient with WebViewAssetLoader interceptor
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

                // External handlers for phone, email, external links
                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("sms:")) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    } catch (e: Exception) {
                        Log.e("VoterApp", "Error opening external scheme: $url", e)
                    }
                }

                // If user clicks out to external Firebase Console or Google links, open in browser
                if (url.contains("console.firebase.google.com") || url.contains("accounts.google.com")) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
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
                    Log.e("VoterApp", "Failed to load: $failedUrl - ${error?.description}")

                    // If local asset failed, fallback to live URL
                    if (failedUrl.contains("appassets.androidplatform.net")) {
                        Log.i("VoterApp", "Falling back to live hosted URL: $defaultLiveUrl")
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

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    /**
     * Native JavaScript Interface exposed to Web code
     */
    class WebAppInterface(private val context: Context) {
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
    }
}
