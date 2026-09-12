package com.sunpanel.zoom

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout

/**
 * 应用内 WebView：支持两指捏合缩放 + 右下角紧凑 +/- 缩放按钮。
 * 强制放开页面 user-scalable 限制，并保留登录 Cookie（App 私有 CookieManager）。
 */
class ZoomWebViewActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var urlBox: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra("url") ?: ""

        val dm = resources.displayMetrics
        val dp = { v: Int -> (v * dm.density).toInt() }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // ---- 顶部工具栏 ----
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#121212"))
            setPadding(dp(6), dp(6), dp(6), dp(6))
        }
        val back = textBtn("‹", dp)
        val fwd = textBtn("›", dp)
        val refresh = textBtn("⟳", dp)
        urlBox = EditText(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            setBackgroundColor(Color.TRANSPARENT)
            setText(url)
            isFocusable = false
            isFocusableInTouchMode = false
            textSize = 13f
        }
        val close = textBtn("✕", dp)
        toolbar.addView(back)
        toolbar.addView(fwd)
        toolbar.addView(refresh)
        toolbar.addView(urlBox)
        toolbar.addView(close)

        // ---- 内容区：WebView + 缩放浮层 ----
        val content = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.setSupportZoom(true)          // 开启缩放（捏合 + 我们的按钮）
            settings.builtInZoomControls = false    // 隐藏安卓自带缩放控件，用我们自己的
            settings.displayZoomControls = false
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            settings.allowFileAccess = false
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, u: String?) {
                    super.onPageFinished(view, u)
                    urlBox.setText(u)
                    // 强制 user-scalable=yes，连锁了缩放的页面也能放大
                    view?.evaluateJavascript(
                        "(function(){try{" +
                            "var c='width=device-width, initial-scale=1.0, maximum-scale=10.0, minimum-scale=0.1, user-scalable=yes';" +
                            "var m=document.querySelector('meta[name=viewport]');" +
                            "if(m){m.setAttribute('content',c);}" +
                            "else{var n=document.createElement('meta');n.name='viewport';n.content=c;document.head.appendChild(n);}" +
                        "}catch(e){}})();",
                        null
                    )
                }
            }
            webChromeClient = WebChromeClient()
        }
        CookieManager.getInstance().setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        }
        webView.loadUrl(url)

        // ---- 右下角紧凑缩放条（+ 在上、- 在下）----
        val zoomBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        val plus = roundBtn("+", dp)
        val minus = roundBtn("–", dp)
        val gap = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, dp(8))
        }
        plus.setOnClickListener { webView.zoomIn() }
        minus.setOnClickListener { webView.zoomOut() }
        zoomBar.addView(plus)
        zoomBar.addView(gap)
        zoomBar.addView(minus)

        val zoomContainer = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        val zoomWrap = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.END or Gravity.BOTTOM
            setMargins(0, 0, dp(12), dp(12))
        }
        zoomContainer.addView(zoomBar, zoomWrap)

        content.addView(webView)
        content.addView(zoomContainer)

        root.addView(toolbar)
        root.addView(content)
        setContentView(root)

        back.setOnClickListener { if (webView.canGoBack()) webView.goBack() }
        fwd.setOnClickListener { if (webView.canGoForward()) webView.goForward() }
        refresh.setOnClickListener { webView.reload() }
        close.setOnClickListener { finish() }
    }

    private fun textBtn(t: String, dp: (Int) -> Int): Button {
        return Button(this).apply {
            text = t
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.TRANSPARENT)
            textSize = 22f
            minWidth = dp(40)
            minHeight = dp(40)
            setPadding(0, 0, 0, 0)
        }
    }

    private fun roundBtn(t: String, dp: (Int) -> Int): Button {
        return Button(this).apply {
            text = t
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#B3000000")) // 半透明黑，低调
            textSize = 22f
            minWidth = dp(44)
            minHeight = dp(44)
            setPadding(0, 0, 0, 0)
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
