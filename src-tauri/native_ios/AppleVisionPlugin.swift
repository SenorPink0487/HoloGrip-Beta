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

    private var photoPickerDelegate: Any?

    /// 专属原生 Apple 纯净相册直选通道：
    /// 直接调起系统 Photo Library 界面，彻底杜绝 WebKit 粗糙原生弹窗与遮挡问题。
    @objc public func pickPhoto(_ invoke: Invoke) {
        DispatchQueue.main.async {
            guard let webview = self.attachedWebView,
                  let rootVC = webview.window?.rootViewController ?? UIApplication.shared.connectedScenes
                    .compactMap({ ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow })?.rootViewController })
                    .first else {
                invoke.reject("No root view controller found")
                return
            }

            let picker = UIImagePickerController()
            picker.sourceType = .photoLibrary
            picker.mediaTypes = ["public.image"]
            picker.modalPresentationStyle = .formSheet

            let delegate = HoloGripPhotoPickerDelegate(invoke: invoke, picker: picker) { [weak self] in
                self?.photoPickerDelegate = nil
            }
            self.photoPickerDelegate = delegate
            picker.delegate = delegate

            rootVC.present(picker, animated: true, completion: nil)
        }
    }
}

private class HoloGripPhotoPickerDelegate: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private let invoke: Invoke
    private weak var picker: UIImagePickerController?
    private let onComplete: () -> Void

    init(invoke: Invoke, picker: UIImagePickerController, onComplete: @escaping () -> Void) {
        self.invoke = invoke
        self.picker = picker
        self.onComplete = onComplete
        super.init()
    }

    private static func normalizedPickerImage(_ image: UIImage, maxEdge: CGFloat = 1800) -> UIImage {
        let srcW = max(1, image.size.width)
        let srcH = max(1, image.size.height)
        let scale = min(1.0, maxEdge / max(srcW, srcH))
        let targetSize = CGSize(width: round(srcW * scale), height: round(srcH * scale))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: targetSize))
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
        picker.dismiss(animated: true, completion: nil)
        self.onComplete()
        if let rawImage = (info[.editedImage] ?? info[.originalImage]) as? UIImage {
            let normalized = Self.normalizedPickerImage(rawImage, maxEdge: 1800)
            if let data = normalized.jpegData(compressionQuality: 0.88) {
                let base64 = data.base64EncodedString()
                let dataUrl = "data:image/jpeg;base64,\(base64)"
                self.invoke.resolve(["dataUrl": dataUrl])
                return
            }
        }
        self.invoke.reject("Failed to encode chosen image")
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true, completion: nil)
        self.onComplete()
        self.invoke.resolve(["cancelled": true])
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
