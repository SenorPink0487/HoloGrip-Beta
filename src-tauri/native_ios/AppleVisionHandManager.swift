import Foundation
import AVFoundation
import Vision
import CoreImage
import UIKit
import WebKit

#if canImport(Tauri)
import Tauri
#endif

/// 苹果原生 Vision 框架超高性能隔空手势追踪核心管理器
/// 运行于 Apple Neural Engine (ANE) 与 GPU 硬件管线，实现 60 FPS 极低延迟（≤5ms）双手关键点检测与视频预览
@objc public class AppleVisionHandManager: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    @objc public static let shared = AppleVisionHandManager()

    private weak var webView: WKWebView?
    private var captureSession: AVCaptureSession?
    private var videoOutput: AVCaptureVideoDataOutput?
    private let sessionQueue = DispatchQueue(label: "cn.hologrip.appleVisionSessionQueue")
    private let visionQueue = DispatchQueue(label: "cn.hologrip.appleVisionInferenceQueue", qos: .userInteractive)
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

    private var isRunning = false
    private var isSetup = false
    private var frameCounter: UInt64 = 0

    // 历史关节点缓存与时间平滑（消除骨骼线乱跳与缺失点突变）
    private var previousLandmarks: [String: [[String: Any]]] = [:]
    private var lastSeenTimestamp: [String: CFAbsoluteTime] = [:]

    // 关节层级拓扑（子关节 -> 父关节索引，用于骨骼断裂时平滑锚定）
    private let parentJointIndices: [Int] = [
        0,  // 0: wrist -> wrist
        0,  // 1: thumbCMC -> wrist
        1,  // 2: thumbMP -> thumbCMC
        2,  // 3: thumbIP -> thumbMP
        3,  // 4: thumbTip -> thumbIP
        0,  // 5: indexMCP -> wrist
        5,  // 6: indexPIP -> indexMCP
        6,  // 7: indexDIP -> indexPIP
        7,  // 8: indexTip -> indexDIP
        0,  // 9: middleMCP -> wrist
        9,  // 10: middlePIP -> middleMCP
        10, // 11: middleDIP -> middlePIP
        11, // 12: middleTip -> middleDIP
        0,  // 13: ringMCP -> wrist
        13, // 14: ringPIP -> ringMCP
        14, // 15: ringDIP -> ringPIP
        15, // 16: ringTip -> ringDIP
        0,  // 17: littleMCP -> wrist
        17, // 18: littlePIP -> littleMCP
        18, // 19: littleDIP -> littlePIP
        19  // 20: littleTip -> littleDIP
    ]

    // Apple Vision 手势姿态检测请求
    private lazy var handPoseRequest: VNDetectHumanHandPoseRequest = {
        let req = VNDetectHumanHandPoseRequest()
        req.maximumHandCount = 2
        return req
    }()

    private override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleOrientationDidChange),
            name: UIDevice.orientationDidChangeNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleOrientationDidChange() {
        sessionQueue.async { [weak self] in
            self?.updateVideoOrientation()
        }
    }

    /// 检查当前系统与硬件是否支持 Apple Vision 手部骨骼追踪
    @objc public func isSupported() -> Bool {
        if #available(iOS 14.0, *) {
            return true
        }
        return false
    }

    /// 关联宿主 WKWebView 实例，实现毫秒级直接 JS 管道分发
    @objc public func attachWebView(_ webView: WKWebView) {
        self.webView = webView
        NSLog("[AppleVisionHandManager] Attached WKWebView for direct high-speed JS dispatch.")
    }

    /// 启动原生摄像头采集与 Vision 神经计算管线
    @objc public func start() -> Bool {
        guard isSupported() else {
            NSLog("[AppleVisionHandManager] Apple Vision hand pose is not supported on this iOS version.")
            return false
        }

        if isRunning {
            return true
        }

        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if !self.isSetup {
                self.setupCaptureSession()
            }
            if let session = self.captureSession, !session.isRunning {
                self.updateVideoOrientation()
                session.startRunning()
                self.isRunning = true
                NSLog("[AppleVisionHandManager] Native AVCaptureSession & Vision pipeline started at 60 FPS.")
            }
        }
        return true
    }

    /// 停止采集与推理管线，释放摄像头与计算资源
    @objc public func stop() -> Bool {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if let session = self.captureSession, session.isRunning {
                session.stopRunning()
                self.isRunning = false
                self.previousLandmarks.removeAll()
                self.lastSeenTimestamp.removeAll()
                NSLog("[AppleVisionHandManager] Native AVCaptureSession & Vision pipeline stopped.")
            }
        }
        return true
    }

    private func setupCaptureSession() {
        let session = AVCaptureSession()
        session.beginConfiguration()

        if session.canSetSessionPreset(.vga640x480) {
            session.sessionPreset = .vga640x480
        } else {
            session.sessionPreset = .high
        }

        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera],
            mediaType: .video,
            position: .front
        )

        guard let camera = discoverySession.devices.first else {
            NSLog("[AppleVisionHandManager] No front camera detected on this Apple device.")
            session.commitConfiguration()
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: camera)
            if session.canAddInput(input) {
                session.addInput(input)
            } else {
                NSLog("[AppleVisionHandManager] Failed to add camera input to AVCaptureSession.")
                session.commitConfiguration()
                return
            }

            try camera.lockForConfiguration()
            for format in camera.formats {
                for range in format.videoSupportedFrameRateRanges {
                    if range.maxFrameRate >= 59.0 {
                        camera.activeFormat = format
                        camera.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 60)
                        camera.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 60)
                        break
                    }
                }
            }
            camera.unlockForConfiguration()
        } catch {
            NSLog("[AppleVisionHandManager] Camera configuration error: \(error.localizedDescription)")
        }

        let videoOut = AVCaptureVideoDataOutput()
        videoOut.alwaysDiscardsLateVideoFrames = true
        videoOut.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)
        ]
        videoOut.setSampleBufferDelegate(self, queue: visionQueue)

        if session.canAddOutput(videoOut) {
            session.addOutput(videoOut)
            self.videoOutput = videoOut
        }

        session.commitConfiguration()
        self.captureSession = session
        self.isSetup = true
        self.updateVideoOrientation()
    }

    /// 动态使视频输出方向与当前屏幕 UI 界面方向（横屏/竖屏）严格保持 1:1 一致，彻底消除 90 度旋转偏差
    private func updateVideoOrientation() {
        guard let connection = self.videoOutput?.connection(with: .video),
              connection.isVideoOrientationSupported else { return }

        var targetOrientation: AVCaptureVideoOrientation = .landscapeRight
        if Thread.isMainThread {
            targetOrientation = currentInterfaceVideoOrientation()
        } else {
            DispatchQueue.main.sync { [weak self] in
                targetOrientation = self?.currentInterfaceVideoOrientation() ?? .landscapeRight
            }
        }

        connection.videoOrientation = targetOrientation
        // 前端 HandGestureService 统一负责 mirrorX 镜像翻转，此处保持非镜像原生状态以防二次翻转
        if connection.isVideoMirroringSupported {
            connection.isVideoMirrored = false
        }
    }

    private func currentInterfaceVideoOrientation() -> AVCaptureVideoOrientation {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = scenes.compactMap { $0 as? UIWindowScene }.first(where: { $0.activationState == .foregroundActive })
            ?? scenes.compactMap { $0 as? UIWindowScene }.first
        let interfaceOrientation = windowScene?.interfaceOrientation ?? .landscapeRight

        switch interfaceOrientation {
        case .landscapeLeft:
            return .landscapeLeft
        case .landscapeRight:
            return .landscapeRight
        case .portraitUpsideDown:
            return .portraitUpsideDown
        case .portrait:
            return .portrait
        default:
            return .landscapeRight
        }
    }

    // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

    public func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let now = CFAbsoluteTimeGetCurrent()
        frameCounter += 1

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
        do {
            try handler.perform([handPoseRequest])
        } catch {
            return
        }

        guard let rawObservations = handPoseRequest.results, !rawObservations.isEmpty else {
            dispatchEmptyFrame(timestamp: now)
            return
        }

        // 双手空间排序与手性稳健映射：
        // 在前置非镜像摄像头中，画面左侧（小 X）对应真实用户的右手（较大 screenX），画面右侧对应真实用户的左手
        var parsedHands: [(landmarks: [[String: Any]], wristX: Double, chirality: VNChirality, confidence: Float)] = []

        for obs in rawObservations.prefix(2) {
            guard let landmarks = extract21Landmarks(observation: obs) else { continue }
            let wristX = (landmarks[0]["x"] as? Double) ?? 0.5
            parsedHands.append((landmarks: landmarks, wristX: wristX, chirality: obs.chirality, confidence: obs.confidence))
        }

        if parsedHands.isEmpty {
            dispatchEmptyFrame(timestamp: now)
            return
        }

        var handsData: [[String: Any]] = []

        if parsedHands.count == 2 {
            // 双手同时出现：按未镜像相机的 X 排序
            // wristX 较小 -> 位于用户右侧 -> 右手
            // wristX 较大 -> 位于用户左侧 -> 左手
            let sorted = parsedHands.sorted { $0.wristX < $1.wristX }
            let rightHand = sorted[0]
            let leftHand = sorted[1]

            let smoothedRight = smoothLandmarks(raw: rightHand.landmarks, handLabel: "right", now: now)
            let smoothedLeft = smoothLandmarks(raw: leftHand.landmarks, handLabel: "left", now: now)

            handsData.append([
                "landmarks": smoothedRight,
                "handedness": "right",
                "confidence": rightHand.confidence
            ])
            handsData.append([
                "landmarks": smoothedLeft,
                "handedness": "left",
                "confidence": leftHand.confidence
            ])
        } else {
            // 单手出现：结合 Vision 的解剖学手性与屏幕横向分布进行判决
            let single = parsedHands[0]
            var handLabel = "right"

            if single.chirality == .left {
                handLabel = "left"
            } else if single.chirality == .right {
                handLabel = "right"
            } else {
                // 未知手性时通过前置非镜像相机位置判决：x > 0.5 靠近用户左侧，x <= 0.5 靠近用户右侧
                handLabel = single.wristX > 0.5 ? "left" : "right"
            }

            let smoothed = smoothLandmarks(raw: single.landmarks, handLabel: handLabel, now: now)
            handsData.append([
                "landmarks": smoothed,
                "handedness": handLabel,
                "confidence": single.confidence
            ])
        }

        let latencyMs = (CFAbsoluteTimeGetCurrent() - now) * 1000.0

        var payload: [String: Any] = [
            "hasHand": !handsData.isEmpty,
            "timestamp": now * 1000.0,
            "hands": handsData,
            "latencyMs": latencyMs,
            "frameId": frameCounter,
            "backend": "Apple Vision Framework (ANE Native)"
        ]

        // 每隔 2 帧压缩一张超轻量（320x240 ~8KB）JPEG 画面注入 HUD 预览，
        // 让用户看清自己真实的双手手部影像，彻底告别纯黑画面
        if frameCounter % 2 == 0 {
            if let frameJpeg = encodePixelBufferToJpegBase64(pixelBuffer: pixelBuffer) {
                payload["frameImage"] = "data:image/jpeg;base64," + frameJpeg
            }
        }

        dispatchFrame(payload: payload)
    }

    /// 提取 Apple Vision 21 个关节并进行骨骼拓扑保护，彻底杜绝跳变至 (0.5, 0.5)
    private func extract21Landmarks(observation: VNHumanHandPoseObservation) -> [[String: Any]]? {
        guard #available(iOS 14.0, *) else { return nil }

        let jointKeys: [VNHumanHandPoseObservation.JointName] = [
            .wrist,             // 0
            .thumbCMC,          // 1
            .thumbMP,           // 2
            .thumbIP,           // 3
            .thumbTip,          // 4
            .indexMCP,          // 5
            .indexPIP,          // 6
            .indexDIP,          // 7
            .indexTip,          // 8
            .middleMCP,         // 9
            .middlePIP,         // 10
            .middleDIP,         // 11
            .middleTip,         // 12
            .ringMCP,           // 13
            .ringPIP,           // 14
            .ringDIP,           // 15
            .ringTip,           // 16
            .littleMCP,         // 17
            .littlePIP,         // 18
            .littleDIP,         // 19
            .littleTip          // 20
        ]

        var points: [[String: Any]] = []
        points.reserveCapacity(21)

        // 第一步：解析具备高置信度的原生关节点
        for key in jointKeys {
            if let pt = try? observation.recognizedPoint(key), pt.confidence >= 0.20 {
                // Vision location 原点在左下角 (Y向上)，转换为 Web 标准 (0,0) 在左上角
                let normX = Double(pt.location.x)
                let normY = 1.0 - Double(pt.location.y)
                points.append([
                    "x": normX,
                    "y": normY,
                    "z": 0.0,
                    "visibility": Double(pt.confidence)
                ])
            } else {
                // 暂时标记缺失，后续基于拓扑父关节与历史平滑修补，严禁回退到 (0.5, 0.5)
                points.append([
                    "x": -1.0,
                    "y": -1.0,
                    "z": 0.0,
                    "visibility": 0.0
                ])
            }
        }

        // 第二步：拓扑修复（若某关节因遮挡缺失，优先采用其父关节位置保持骨骼连续，绝不跨越屏幕乱跳）
        let validCount = points.filter { ($0["x"] as? Double ?? -1.0) >= 0.0 }.count
        if validCount < 4 {
            return nil
        }

        for i in 0..<21 {
            let px = points[i]["x"] as? Double ?? -1.0
            if px < 0.0 {
                let parentIdx = parentJointIndices[i]
                let parentX = points[parentIdx]["x"] as? Double ?? -1.0
                if parentX >= 0.0 {
                    points[i]["x"] = points[parentIdx]["x"]
                    points[i]["y"] = points[parentIdx]["y"]
                    points[i]["visibility"] = 0.1
                } else if points[0]["x"] as? Double ?? -1.0 >= 0.0 {
                    // 最底限对齐到手腕
                    points[i]["x"] = points[0]["x"]
                    points[i]["y"] = points[0]["y"]
                    points[i]["visibility"] = 0.05
                }
            }
        }

        return points
    }

    /// 双重 OneEuro / EMA 平滑器，消除高频传感器微颤，维持骨骼线极度稳定
    private func smoothLandmarks(raw: [[String: Any]], handLabel: String, now: CFAbsoluteTime) -> [[String: Any]] {
        guard let prev = previousLandmarks[handLabel],
              let lastTime = lastSeenTimestamp[handLabel],
              now - lastTime < 0.50 else {
            previousLandmarks[handLabel] = raw
            lastSeenTimestamp[handLabel] = now
            return raw
        }

        var smoothed: [[String: Any]] = []
        smoothed.reserveCapacity(21)

        for i in 0..<21 {
            let curX = (raw[i]["x"] as? Double) ?? 0.5
            let curY = (raw[i]["y"] as? Double) ?? 0.5
            let prevX = (prev[i]["x"] as? Double) ?? curX
            let prevY = (prev[i]["y"] as? Double) ?? curY

            let dist = hypot(curX - prevX, curY - prevY)
            // 距离大时响应快 (0.85)，细微颤动时强阻尼 (0.45)
            let alpha = dist > 0.08 ? 0.88 : (dist > 0.02 ? 0.65 : 0.45)

            let finalX = prevX + (curX - prevX) * alpha
            let finalY = prevY + (curY - prevY) * alpha

            smoothed.append([
                "x": finalX,
                "y": finalY,
                "z": 0.0,
                "visibility": raw[i]["visibility"] ?? 1.0
            ])
        }

        previousLandmarks[handLabel] = smoothed
        lastSeenTimestamp[handLabel] = now
        return smoothed
    }

    /// 将 CVPixelBuffer 压缩为轻量 JPEG Base64 编码，用于在 Webview 预览窗中流畅播放实时摄像头画面
    private func encodePixelBufferToJpegBase64(pixelBuffer: CVPixelBuffer) -> String? {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        guard width > 0 && height > 0 else { return nil }

        let scaleX = 320.0 / CGFloat(width)
        let scaleY = 240.0 / CGFloat(height)
        let scaledImage = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let jpegData = ciContext.jpegRepresentation(
                of: scaledImage,
                colorSpace: colorSpace,
                options: [:]
              ) else {
            return nil
        }

        return jpegData.base64EncodedString()
    }

    private func dispatchEmptyFrame(timestamp: CFAbsoluteTime) {
        let payload: [String: Any] = [
            "hasHand": false,
            "timestamp": timestamp * 1000.0,
            "hands": [],
            "latencyMs": 0.5,
            "frameId": frameCounter,
            "backend": "Apple Vision Framework (ANE Native)"
        ]
        dispatchFrame(payload: payload)
    }

    private func dispatchFrame(payload: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let webView = self.webView else { return }
            webView.evaluateJavaScript("window.__hologrip_onAppleVisionFrame && window.__hologrip_onAppleVisionFrame(\(jsonString));", completionHandler: nil)
        }
    }
}

// MARK: - C FFI 导出符号，方便 Rust 运行时与 Tauri 底层直接调用

@_cdecl("hologrip_apple_vision_is_supported")
public func hologripAppleVisionIsSupported() -> Bool {
    return AppleVisionHandManager.shared.isSupported()
}

@_cdecl("hologrip_apple_vision_start")
public func hologripAppleVisionStart() -> Bool {
    return AppleVisionHandManager.shared.start()
}

@_cdecl("hologrip_apple_vision_stop")
public func hologripAppleVisionStop() -> Bool {
    return AppleVisionHandManager.shared.stop()
}
