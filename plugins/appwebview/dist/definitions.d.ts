export interface AppWebViewPlugin {
  open(options: { url: string }): Promise<void>
}

declare const AppWebView: AppWebViewPlugin

export { AppWebView }
