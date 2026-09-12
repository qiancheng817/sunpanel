package com.sunpanel.appwebview

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * 应用内 WebView：
 *  - 完全在 App 内部打开，绝不跳外部浏览器
 *  - 支持双指捏合缩放（不显示任何缩放按钮）
 *  - 页面加载完成后强制放开 user-scalable 限制，禁止缩放的后台也能放大
 *  - 保留登录 Cookie（App 内 WebView 私有 CookieManager）
 */
class AppWebViewActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var titleText: TextView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = intent.getStringExtra("url") ?: ""
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        // 根布局：竖向线性布局，不用 weight（避免权重测量导致的布局塌陷）
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#101010"))
        }

        // ---- 顶部工具条（固定包裹高度）----
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#181818"))
            setPadding(dp(4), dp(6), dp(4), dp(6))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        val btnBack = barBtn("‹", dp)
        val btnFwd = barBtn("›", dp)
        val btnReload = barBtn("⟳", dp)
        titleText = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setTextColor(Color.parseColor("#9A9A9A"))
            textSize = 12f
            setSingleLine(true)
            text = url
        }
        val btnClose = barBtn("✕", dp)

        bar.addView(btnBack)
        bar.addView(btnFwd)
        bar.addView(btnReload)
        bar.addView(titleText)
        bar.addView(btnClose)

        // ---- 内容区：WebView 铺满剩余空间 ----
        webView = WebView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            with(settings) {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                // 缩放：支持缩放 + 启用内置手势（双指捏合），但不显示系统 +/- 控件
                setSupportZoom(true)
                builtInZoomControls = true
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_DEFAULT
                allowFileAccess = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                }
            }

            val cm = CookieManager.getInstance()
            cm.setAcceptCookie(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cm.setAcceptThirdPartyCookies(this, true)
            }

            webViewClient = object : WebViewClient() {

                @Suppress("OVERRIDE_DEPRECATION")
                override fun shouldOverrideUrlLoading(view: WebView?, u: String?): Boolean {
                    return handleUrl(u)
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    return handleUrl(request?.url?.toString())
                }

                override fun onPageFinished(view: WebView?, u: String?) {
                    super.onPageFinished(view, u)
                    if (!u.isNullOrEmpty()) titleText.text = u
                    // 强制放开缩放限制：改写/注入 viewport
                    view?.evaluateJavascript(
                        "(function(){try{" +
                            "var c='width=device-width, initial-scale=1.0, maximum-scale=10.0, minimum-scale=0.1, user-scalable=yes';" +
                            "var m=document.querySelector('meta[name=viewport]');" +
                            "if(m){m.setAttribute('content',c);}" +
                            "else{var n=document.createElement('meta');n.name='viewport';n.content=c;" +
                            "(document.head||document.documentElement).appendChild(n);}" +
                            "}catch(e){}})();",
                        null
                    )
                }

                // 内网自签名证书放行（自家服务，避免 https 打不开）
                @SuppressLint("WebViewClientOnReceivedSslError")
                override fun onReceivedSslError(
                    view: WebView?,
                    handler: SslErrorHandler?,
                    error: android.net.http.SslError?
                ) {
                    handler?.proceed()
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onReceivedTitle(view: WebView?, t: String?) {
                    super.onReceivedTitle(view, t)
                    if (!t.isNullOrEmpty()) titleText.text = t
                }
            }
        }

        root.addView(bar)
        root.addView(webView)
        setContentView(root)

        btnBack.setOnClickListener { if (webView.canGoBack()) webView.goBack() }
        btnFwd.setOnClickListener { if (webView.canGoForward()) webView.goForward() }
        btnReload.setOnClickListener { webView.reload() }
        btnClose.setOnClickListener { finish() }

        if (url.isNotEmpty()) webView.loadUrl(url)
    }

    /** http/https 留在应用内打开；其他协议（如 intent:/tel:）交给系统 */
    private fun handleUrl(u: String?): Boolean {
        if (u.isNullOrEmpty()) return false
        if (u.startsWith("http://", true) || u.startsWith("https://", true)) return false
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
            true
        } catch (e: Exception) {
            true
        }
    }

    private fun barBtn(t: String, dp: (Int) -> Int): Button {
        return Button(this).apply {
            text = t
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.TRANSPARENT)
            textSize = 20f
            minWidth = dp(42)
            minHeight = dp(40)
            setPadding(0, 0, 0, 0)
        }
    }

    @Suppress("MissingSuperCall")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
