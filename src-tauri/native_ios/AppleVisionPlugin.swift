import Foundation
import UIKit
import WebKit
import ObjectiveC.runtime

import Tauri

@objc(AppleVisionPlugin)
public class AppleVisionPlugin: Plugin {
    public static var shared: AppleVisionPlugin?
    private weak var attachedWebView: WKWebView?
    private static var didConfigureStatusBar = false

    public override init() {
        super.init()
        AppleVisionPlugin.shared = self
        AppleVisionPlugin.enforceStatusBarHidden()
    }

    /// Suppresses the system status bar across iPadOS / iOS to ensure a 100% immersive,
    /// distraction-free laboratory viewport without top system bar obstruction.
    @objc public static func enforceStatusBarHidden() {
        guard !didConfigureStatusBar else { return }
        didConfigureStatusBar = true

        let prefersHiddenSel = #selector(getter: UIViewController.prefersStatusBarHidden)
        let block: @convention(block) (AnyObject) -> Bool = { _ in true }
        let newImp = imp_implementationWithBlock(block)

        let targetClasses: [AnyClass] = [
            UIViewController.self,
            NSClassFromString("TaoUIViewController")
        ].compactMap { $0 }

        for cls in targetClasses {
            patchClassStatusBarHidden(cls: cls, sel: prefersHiddenSel, imp: newImp)
        }

        swizzleViewWillAppear()
    }

    public static func patchClassStatusBarHidden(cls: AnyClass, sel: Selector, imp: IMP) {
        if let method = class_getInstanceMethod(cls, sel) {
            method_setImplementation(method, imp)
        } else {
            class_addMethod(cls, sel, imp, "B@:")
        }
    }

    private static func swizzleViewWillAppear() {
        let originalSel = #selector(UIViewController.viewWillAppear(_:))
        let swizzledSel = #selector(UIViewController.hologrip_viewWillAppear(_:))

        guard let originalMethod = class_getInstanceMethod(UIViewController.self, originalSel),
              let swizzledMethod = class_getInstanceMethod(UIViewController.self, swizzledSel) else {
            return
        }

        let didAdd = class_addMethod(
            UIViewController.self,
            originalSel,
            method_getImplementation(swizzledMethod),
            method_getTypeEncoding(swizzledMethod)
        )

        if didAdd {
            class_replaceMethod(
                UIViewController.self,
                swizzledSel,
                method_getImplementation(originalMethod),
                method_getTypeEncoding(originalMethod)
            )
        } else {
            method_exchangeImplementations(originalMethod, swizzledMethod)
        }
    }

    @objc open override func load(webview: WKWebView) {
        self.attachedWebView = webview
        AppleVisionHandManager.shared.attachWebView(webview)
        NSLog("[AppleVisionPlugin] Loaded and attached webview.")

        AppleVisionPlugin.enforceStatusBarHidden()
        AppleVisionPlugin.applyStatusBarAppearanceUpdate(from: webview)
    }

    @objc public static func applyStatusBarAppearanceUpdate(from webview: WKWebView?) {
        DispatchQueue.main.async {
            let block: @convention(block) (AnyObject) -> Bool = { _ in true }
            let newImp = imp_implementationWithBlock(block)
            let prefersHiddenSel = #selector(getter: UIViewController.prefersStatusBarHidden)

            if let taoClass = NSClassFromString("TaoUIViewController") {
                patchClassStatusBarHidden(cls: taoClass, sel: prefersHiddenSel, imp: newImp)
            }

            typealias SetHiddenFunc = @convention(c) (AnyObject, Selector, Bool) -> Void
            let setHiddenSel = NSSelectorFromString("setPrefersStatusBarHidden:")

            func updateVC(_ vc: UIViewController) {
                let cls: AnyClass = type(of: vc)
                patchClassStatusBarHidden(cls: cls, sel: prefersHiddenSel, imp: newImp)
                if let method = class_getInstanceMethod(cls, setHiddenSel) {
                    let imp = method_getImplementation(method)
                    let fn = unsafeBitCast(imp, to: SetHiddenFunc.self)
                    fn(vc, setHiddenSel, true)
                }
                vc.setNeedsStatusBarAppearanceUpdate()
            }

            if let root = webview?.window?.rootViewController {
                updateVC(root)
            }

            for scene in UIApplication.shared.connectedScenes {
                if let windowScene = scene as? UIWindowScene {
                    for window in windowScene.windows {
                        if let root = window.rootViewController {
                            updateVC(root)
                        }
                    }
                }
            }
        }
    }

    @objc public func start(_ invoke: Invoke) {
        if let webview = self.attachedWebView {
            AppleVisionHandManager.shared.attachWebView(webview)
        }
        AppleVisionHandManager.shared.startWithCompletion { success in
            invoke.resolve(["success": success])
        }
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
        let running = AppleVisionHandManager.shared.getIsRunning()
        invoke.resolve([
            "supported": supported,
            "running": running,
            "backend": "Apple Vision Framework (ANE Native)"
        ])
    }
}

extension UIViewController {
    @objc func hologrip_viewWillAppear(_ animated: Bool) {
        self.hologrip_viewWillAppear(animated)

        let prefersHiddenSel = #selector(getter: UIViewController.prefersStatusBarHidden)
        let block: @convention(block) (AnyObject) -> Bool = { _ in true }
        let newImp = imp_implementationWithBlock(block)

        let cls: AnyClass = type(of: self)
        AppleVisionPlugin.patchClassStatusBarHidden(cls: cls, sel: prefersHiddenSel, imp: newImp)

        typealias SetHiddenFunc = @convention(c) (AnyObject, Selector, Bool) -> Void
        let setHiddenSel = NSSelectorFromString("setPrefersStatusBarHidden:")
        if let method = class_getInstanceMethod(cls, setHiddenSel) {
            let imp = method_getImplementation(method)
            let fn = unsafeBitCast(imp, to: SetHiddenFunc.self)
            fn(self, setHiddenSel, true)
        }

        self.setNeedsStatusBarAppearanceUpdate()
    }
}

@_cdecl("init_plugin_apple_vision")
func initPluginAppleVision() -> UnsafeMutableRawPointer {
    AppleVisionPlugin.enforceStatusBarHidden()
    let plugin = AppleVisionPlugin()
    return Unmanaged.passRetained(plugin).toOpaque()
}
