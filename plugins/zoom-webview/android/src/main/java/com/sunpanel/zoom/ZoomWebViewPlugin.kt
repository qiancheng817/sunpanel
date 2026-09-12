package com.sunpanel.zoom

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ZoomWebView")
class ZoomWebViewPlugin : Plugin() {
    @PluginMethod
    fun open(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrEmpty()) {
            call.reject("missing url")
            return
        }
        val intent = Intent(activity, ZoomWebViewActivity::class.java)
        intent.putExtra("url", url)
        activity.startActivity(intent)
        call.resolve()
    }
}
