export interface ZoomWebViewPlugin {
  open(options: { url: string }): Promise<void>
}

declare const ZoomWebView: ZoomWebViewPlugin

export { ZoomWebView }
