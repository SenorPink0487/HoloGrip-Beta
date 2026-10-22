import Foundation
import UIKit
import WebKit

import Tauri

@objc(AppleVisionPlugin)
public class AppleVisionPlugin: Plugin {
    public static var shared: AppleVisionPlugin?

    public override init() {
        super.init()
        AppleVisionPlugin.shared = self
    }

    @objc open override func load(webview: WKWebView) {
        AppleVisionHandManager.shared.attachWebView(webview)
        NSLog("[AppleVisionPlugin] Loaded and attached webview.")
    }

    @objc public func start(_ invoke: Invoke) {
        let success = AppleVisionHandManager.shared.start()
        invoke.resolve(["success": success])
    }

    @objc public func stop(_ invoke: Invoke) {
        let success = AppleVisionHandManager.shared.stop()
        invoke.resolve(["success": success])
    }

    @objc public func isSupported(_ invoke: Invoke) {
        invoke.resolve(["supported": AppleVisionHandManager.shared.isSupported()])
    }

    @objc public func getStatus(_ invoke: Invoke) {
        let supported = AppleVisionHandManager.shared.isSupported()
        invoke.resolve([
            "supported": supported,
            "backend": "Apple Vision Framework (ANE Native)"
        ])
    }
}

@_cdecl("init_plugin_apple_vision")
func initPluginAppleVision() -> UnsafeMutableRawPointer {
    let plugin = AppleVisionPlugin()
    return Unmanaged.passRetained(plugin).toOpaque()
}
