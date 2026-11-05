import Foundation
import UIKit
import PhotosUI
import WebKit
import ObjectiveC.runtime

import Tauri

@objc(AppleVisionPlugin)
public class AppleVisionPlugin: Plugin {
    public static var shared: AppleVisionPlugin?
    private weak var attachedWebView: WKWebView?
    private static var didConfigureStatusBar = false
    private let speechRecognition = AppleSpeechRecognitionManager()

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

    private struct SpeechStartArgs: Decodable {
        let sessionId: String
        let lang: String
    }

    private struct SpeechStopArgs: Decodable {
        let sessionId: String
    }

    @objc public func startSpeech(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SpeechStartArgs.self)
        DispatchQueue.main.async {
            self.speechRecognition.start(id: args.sessionId, language: args.lang, invoke: invoke)
        }
    }

    @objc public func stopSpeech(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SpeechStopArgs.self)
        DispatchQueue.main.async {
            self.speechRecognition.stop(id: args.sessionId)
            invoke.resolve()
        }
    }

    /// 仅访问用户选中的照片，无需请求整个照片图库的读取权限。
    @objc public func pickPhoto(_ invoke: Invoke) {
        DispatchQueue.main.async {
            guard self.photoPickerDelegate == nil else {
                invoke.reject("Photo picker is already open")
                return
            }
            guard let rootVC = self.attachedWebView?.window?.rootViewController ?? UIApplication.shared.connectedScenes
                    .filter({ $0.activationState == .foregroundActive })
                    .compactMap({ ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow })?.rootViewController })
                    .first else {
                invoke.reject("No root view controller found")
                return
            }

            var presenter = rootVC
            while let presented = presenter.presentedViewController {
                presenter = presented
            }
            guard presenter.viewIfLoaded?.window != nil, !presenter.isBeingDismissed else {
                invoke.reject("Photo picker presenter is not ready")
                return
            }

            var configuration = PHPickerConfiguration()
            configuration.filter = .images
            configuration.selectionLimit = 1
            let picker = PHPickerViewController(configuration: configuration)
            picker.modalPresentationStyle = .fullScreen

            let delegate = HoloGripPhotoPickerDelegate(invoke: invoke) { [weak self] in
                self?.photoPickerDelegate = nil
            }
            self.photoPickerDelegate = delegate
            picker.delegate = delegate

            presenter.present(picker, animated: true, completion: nil)
        }
    }
}

private class HoloGripPhotoPickerDelegate: NSObject, PHPickerViewControllerDelegate {
    private let invoke: Invoke
    private let onComplete: () -> Void

    init(invoke: Invoke, onComplete: @escaping () -> Void) {
        self.invoke = invoke
        self.onComplete = onComplete
        super.init()
    }

    private static func normalizedPickerImage(_ image: UIImage, maxEdge: CGFloat = 1500) -> UIImage {
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

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true) {
            guard let provider = results.first?.itemProvider else {
                self.onComplete()
                self.invoke.resolve(["cancelled": true])
                return
            }
            guard provider.canLoadObject(ofClass: UIImage.self) else {
                self.onComplete()
                self.invoke.reject("Selected photo cannot be loaded as an image")
                return
            }
            provider.loadObject(ofClass: UIImage.self) { object, error in
                DispatchQueue.main.async {
                    defer { self.onComplete() }
                    guard let image = object as? UIImage else {
                        self.invoke.reject(error?.localizedDescription ?? "Failed to load selected photo")
                        return
                    }
                    let normalized = Self.normalizedPickerImage(image, maxEdge: 1500)
                    guard let data = normalized.jpegData(compressionQuality: 0.84) else {
                        self.invoke.reject("Failed to encode chosen image")
                        return
                    }
                    self.invoke.resolve(["dataUrl": "data:image/jpeg;base64,\(data.base64EncodedString())"])
                }
            }
        }
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
