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

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = intent.getStringExtra("url") ?: ""

        // 根布局：竖向线性布局，不用 weight（避免权重测量导致的布局塌陷）
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#101010"))
        }

        // ---- 底部工具条（窄条，固定高度）----
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#141414"))
            setPadding(dp(2), dp(2), dp(2), dp(2))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(34)
            )
        }
        val btnBack = barBtn("‹")
        val btnFwd = barBtn("›")
        val btnReload = barBtn("⟳")
        titleText = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setTextColor(Color.parseColor("#8A8A8A"))
            textSize = 10f
            setSingleLine(true)
            text = url
        }
        val btnClose = barBtn("✕")

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

                override fun onPageStarted(view: WebView?, u: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, u, favicon)
                    // 尽早注入：允许缩小到 100% 以下（minimum-scale=0.3），并持续强制防止页面改回
                    view?.evaluateJavascript(FORCE_VIEWPORT_JS, null)
                }

                override fun onPageFinished(view: WebView?, u: String?) {
                    super.onPageFinished(view, u)
                    if (!u.isNullOrEmpty()) titleText.text = u
                    // 再次注入兜底（SPA 首屏后仍可能重写 viewport）
                    view?.evaluateJavascript(FORCE_VIEWPORT_JS, null)
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

        root.addView(webView)
        root.addView(bar)
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

    private fun barBtn(t: String): Button {
        return Button(this).apply {
            text = t
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.TRANSPARENT)
            textSize = 14f
            minWidth = dp(34)
            minHeight = dp(28)
            setPadding(0, 0, 0, 0)
            includeFontPadding = false
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

    companion object {
        /** 强制放开缩放范围：可缩小到 30%、放大到 10 倍；并监视页面自身对 viewport 的改写，持续恢复 */
        private val FORCE_VIEWPORT_JS = """
            (function(){
              try{
                var C='width=device-width, initial-scale=1.0, minimum-scale=0.3, maximum-scale=10.0, user-scalable=yes';
                function apply(){
                  var m=document.querySelector('meta[name=viewport]');
                  if(m){ if(m.getAttribute('content')!==C) m.setAttribute('content',C); }
                  else{
                    var n=document.createElement('meta');
                    n.name='viewport'; n.content=C;
                    (document.head||document.documentElement).appendChild(n);
                  }
                }
                apply();
                var h=document.head||document.documentElement;
                if(h && !window.__spVpObs){
                  window.__spVpObs=true;
                  var obs=new MutationObserver(function(){ apply(); });
                  obs.observe(h,{subtree:true,childList:true,attributes:true,attributeFilter:['content','name']});
                  var t=0; var iv=setInterval(function(){ apply(); if(++t>15) clearInterval(iv); },200);
                }
              }catch(e){}
            })();
        """.trimIndent().replace("\n", " ")
    }
}
