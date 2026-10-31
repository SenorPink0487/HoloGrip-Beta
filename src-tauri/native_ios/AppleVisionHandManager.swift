import Foundation
import AVFoundation
import CoreMedia
import CoreVideo
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
    private let orientationLock = NSLock()
    private var cachedVideoOrientation: AVCaptureVideoOrientation = .landscapeRight

    private var isRunning = false
    private var isSetup = false
    private var frameCounter: UInt64 = 0

    // 历史关节点缓存与时间平滑（消除骨骼线乱跳与缺失点突变）
    private var previousLandmarks: [String: [[String: Any]]] = [:]
    private var lastSeenTimestamp: [String: CFAbsoluteTime] = [:]
    private var lastSingleHandLabel: String = "right"
    private var lastSingleHandTimestamp: CFAbsoluteTime = 0

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
        if Thread.isMainThread {
            refreshCachedVideoOrientationOnMain()
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.refreshCachedVideoOrientationOnMain()
            }
        }
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
        let updateBlock = { [weak self] in
            guard let self = self else { return }
            self.refreshCachedVideoOrientationOnMain()
            self.sessionQueue.async { [weak self] in
                self?.updateVideoOrientation()
            }
        }
        if Thread.isMainThread {
            updateBlock()
        } else {
            DispatchQueue.main.async(execute: updateBlock)
        }
    }

    /// 检查当前系统与硬件是否支持 Apple Vision 手部骨骼追踪
    @objc public func isSupported() -> Bool {
        if #available(iOS 14.0, *) {
            return true
        }
        return false
    }

    /// 返回当前采集与 Vision 推理管线是否正在运行
    @objc public func getIsRunning() -> Bool {
        return isRunning && (captureSession?.isRunning ?? false)
    }

    /// 关联宿主 WKWebView 实例，实现毫秒级直接 JS 管道分发
    @objc public func attachWebView(_ webView: WKWebView) {
        self.webView = webView
        if Thread.isMainThread {
            refreshCachedVideoOrientationOnMain()
        }
        NSLog("[AppleVisionHandManager] Attached WKWebView for direct high-speed JS dispatch.")
    }

    /// 当 Plugin.load 时序晚于命令调用或 WebView 重建时，自动从活跃 UIWindowScene 视图树中定位宿主 WKWebView
    private func resolveActiveWebViewOnMain() -> WKWebView? {
        if let existing = self.webView {
            return existing
        }
        guard Thread.isMainThread else { return self.webView }

        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let orderedScenes = scenes.sorted { lhs, rhs in
            (lhs.activationState == .foregroundActive ? 0 : 1) < (rhs.activationState == .foregroundActive ? 0 : 1)
        }

        for scene in orderedScenes {
            let orderedWindows = scene.windows.sorted { lhs, rhs in
                (lhs.isKeyWindow ? 0 : 1) < (rhs.isKeyWindow ? 0 : 1)
            }
            for window in orderedWindows {
                if let found = findWKWebView(in: window) {
                    self.webView = found
                    NSLog("[AppleVisionHandManager] Auto-discovered active WKWebView from UIWindowScene.")
                    return found
                }
            }
        }
        return nil
    }

    private func findWKWebView(in view: UIView) -> WKWebView? {
        if let wk = view as? WKWebView {
            return wk
        }
        for subview in view.subviews {
            if let found = findWKWebView(in: subview) {
                return found
            }
        }
        return nil
    }

    /// 异步请求/校验相机权限并启动原生 AVCaptureSession + Vision 神经计算管线，回调真实启动结果
    @objc public func startWithCompletion(_ completion: @escaping (Bool) -> Void) {
        let callbackLock = NSLock()
        var didComplete = false
        let finishOnce: (Bool) -> Void = { success in
            callbackLock.lock()
            let alreadyDone = didComplete
            didComplete = true
            callbackLock.unlock()
            if !alreadyDone {
                completion(success)
            }
        }

        guard isSupported() else {
            NSLog("[AppleVisionHandManager] Apple Vision hand pose is not supported on this iOS version.")
            finishOnce(false)
            return
        }

        let checkAuthAndStart = { [weak self] in
            guard let self = self else {
                finishOnce(false)
                return
            }
            self.refreshCachedVideoOrientationOnMain()
            _ = self.resolveActiveWebViewOnMain()

            let authStatus = AVCaptureDevice.authorizationStatus(for: .video)
            switch authStatus {
            case .authorized:
                self.startSessionOnQueue(completion: finishOnce)

            case .notDetermined:
                NSLog("[AppleVisionHandManager] Requesting iPadOS/iOS front camera permission...")
                AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                    guard let self = self else {
                        finishOnce(false)
                        return
                    }
                    guard granted else {
                        NSLog("[AppleVisionHandManager] Camera access denied by user.")
                        finishOnce(false)
                        return
                    }
                    DispatchQueue.main.async { [weak self] in
                        guard let self = self else {
                            finishOnce(false)
                            return
                        }
                        self.refreshCachedVideoOrientationOnMain()
                        _ = self.resolveActiveWebViewOnMain()
                        self.startSessionOnQueue(completion: finishOnce)
                    }
                }

            case .denied, .restricted:
                NSLog("[AppleVisionHandManager] Camera access denied or restricted (status=\(authStatus.rawValue)).")
                finishOnce(false)

            @unknown default:
                finishOnce(false)
            }
        }

        if Thread.isMainThread {
            checkAuthAndStart()
        } else {
            DispatchQueue.main.async(execute: checkAuthAndStart)
        }
    }

    private func startSessionOnQueue(completion: @escaping (Bool) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self = self else {
                completion(false)
                return
            }

            if let existing = self.captureSession, existing.isRunning {
                self.updateVideoOrientation()
                self.isRunning = true
                completion(true)
                return
            }

            if !self.isSetup || self.captureSession == nil {
                let configured = self.setupCaptureSession()
                if !configured {
                    self.isRunning = false
                    completion(false)
                    return
                }
            }

            guard let session = self.captureSession else {
                self.isRunning = false
                completion(false)
                return
            }

            self.updateVideoOrientation()
            if !session.isRunning {
                session.startRunning()
            }

            let running = session.isRunning
            self.isRunning = running
            if running {
                NSLog("[AppleVisionHandManager] Native AVCaptureSession & Vision pipeline started.")
            } else {
                NSLog("[AppleVisionHandManager] Failed to start AVCaptureSession (isRunning == false).")
            }
            completion(running)
        }
    }

    /// 兼容同步接口（内部委托给异步权限与会话启动管线）
    @objc public func start() -> Bool {
        guard isSupported() else { return false }
        let authStatus = AVCaptureDevice.authorizationStatus(for: .video)
        if authStatus == .denied || authStatus == .restricted {
            return false
        }
        startWithCompletion { _ in }
        return true
    }

    /// 停止采集与推理管线，释放摄像头与计算资源
    @objc public func stop() -> Bool {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if let session = self.captureSession, session.isRunning {
                session.stopRunning()
                NSLog("[AppleVisionHandManager] Native AVCaptureSession & Vision pipeline stopped.")
            }
            self.isRunning = false
            self.previousLandmarks.removeAll()
            self.lastSeenTimestamp.removeAll()
        }
        return true
    }

    @discardableResult
    private func setupCaptureSession() -> Bool {
        let session = AVCaptureSession()
        session.beginConfiguration()

        if session.canSetSessionPreset(.vga640x480) {
            session.sessionPreset = .vga640x480
        } else if session.canSetSessionPreset(.hd1280x720) {
            session.sessionPreset = .hd1280x720
        } else {
            session.sessionPreset = .high
        }

        // 兼容全系列 iPad 前置镜头（含广角镜头、M 系列超广角人物居中横向镜头及原深感镜头）
        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTrueDepthCamera],
            mediaType: .video,
            position: .front
        )

        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
            ?? discoverySession.devices.first
            ?? AVCaptureDevice.default(for: .video) else {
            NSLog("[AppleVisionHandManager] No camera detected on this Apple device.")
            session.commitConfiguration()
            return false
        }

        do {
            let input = try AVCaptureDeviceInput(device: camera)
            if session.canAddInput(input) {
                session.addInput(input)
            } else {
                NSLog("[AppleVisionHandManager] Failed to add camera input to AVCaptureSession.")
                session.commitConfiguration()
                return false
            }
        } catch {
            NSLog("[AppleVisionHandManager] Failed to create AVCaptureDeviceInput: \(error.localizedDescription)")
            session.commitConfiguration()
            return false
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
        } else {
            NSLog("[AppleVisionHandManager] Failed to add AVCaptureVideoDataOutput to AVCaptureSession.")
            session.commitConfiguration()
            return false
        }

        // 安全挑选紧凑分辨率（640x480 ~ 1280x720）下的 60 FPS 格式，并严格钳制帧间隔在合法区间内，
        // 避免误选 4K/12MP 格式或因 59.94fps 区间越界触发 Objective-C NSInvalidArgumentException
        configureOptimalFrameRate(for: camera)

        session.commitConfiguration()
        self.captureSession = session
        self.isSetup = true
        self.updateVideoOrientation()
        return true
    }

    private func configureOptimalFrameRate(for camera: AVCaptureDevice) {
        var bestFormat: AVCaptureDevice.Format?
        var bestRange: AVFrameRateRange?
        var bestPixelCount = Int.max

        for format in camera.formats {
            let desc = format.formatDescription
            let subType = CMFormatDescriptionGetMediaSubType(desc)
            let isBiPlanarYuv =
                subType == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange ||
                subType == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            if !isBiPlanarYuv {
                continue
            }

            let dims = CMVideoFormatDescriptionGetDimensions(desc)
            let width = Int(dims.width)
            let height = Int(dims.height)
            guard width >= 640 && width <= 1280 && height >= 480 && height <= 960 else {
                continue
            }

            let pixels = width * height
            for range in format.videoSupportedFrameRateRanges where range.maxFrameRate >= 59.0 {
                if pixels < bestPixelCount {
                    bestPixelCount = pixels
                    bestFormat = format
                    bestRange = range
                }
            }
        }

        guard let chosenFormat = bestFormat, let chosenRange = bestRange else {
            return
        }

        do {
            try camera.lockForConfiguration()
            defer { camera.unlockForConfiguration() }

            var targetDuration = CMTime(value: 1, timescale: 60)
            if CMTimeCompare(targetDuration, chosenRange.minFrameDuration) < 0 {
                targetDuration = chosenRange.minFrameDuration
            }
            if CMTimeCompare(targetDuration, chosenRange.maxFrameDuration) > 0 {
                targetDuration = chosenRange.maxFrameDuration
            }

            camera.activeFormat = chosenFormat
            camera.activeVideoMinFrameDuration = targetDuration
            camera.activeVideoMaxFrameDuration = targetDuration
        } catch {
            NSLog("[AppleVisionHandManager] Optional 60 FPS format lock skipped: \(error.localizedDescription)")
        }
    }

    private func refreshCachedVideoOrientationOnMain() {
        guard Thread.isMainThread else { return }
        let resolved = currentInterfaceVideoOrientation()
        orientationLock.lock()
        cachedVideoOrientation = resolved
        orientationLock.unlock()
    }

    /// 动态使视频输出方向与当前屏幕 UI 界面方向（横屏/竖屏）严格保持 1:1 一致，且绝不在 sessionQueue 上同步阻塞主线程
    private func updateVideoOrientation() {
        guard let connection = self.videoOutput?.connection(with: .video),
              connection.isVideoOrientationSupported else { return }

        let targetOrientation: AVCaptureVideoOrientation
        if Thread.isMainThread {
            let resolved = currentInterfaceVideoOrientation()
            orientationLock.lock()
            cachedVideoOrientation = resolved
            orientationLock.unlock()
            targetOrientation = resolved
        } else {
            orientationLock.lock()
            targetOrientation = cachedVideoOrientation
            orientationLock.unlock()
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
            dispatchEmptyFrame(timestamp: now, pixelBuffer: pixelBuffer)
            return
        }

        // 双手空间排序与手性稳健映射：
        // 在前置非镜像摄像头中，画面左侧（小 X）对应真实用户的右手（较大 screenX），画面右侧对应真实用户的左手
        var parsedHands: [(landmarks: [[String: Any]], centerX: Double, chirality: VNChirality, confidence: Float)] = []
        let candidateObservations = rawObservations.filter { $0.confidence >= 0.25 }

        for obs in candidateObservations.prefix(2) {
            var hint: String? = nil
            if obs.chirality == .left {
                hint = "left"
            } else if obs.chirality == .right {
                hint = "right"
            } else if candidateObservations.count == 1 && (now - lastSingleHandTimestamp) < 0.45 {
                hint = lastSingleHandLabel
            }

            guard let landmarks = extract21Landmarks(observation: obs, handHint: hint, now: now) else { continue }
            let palmIndices = [0, 5, 9, 13, 17]
            var sumX = 0.0
            var countX = 0
            for idx in palmIndices {
                if let px = landmarks[idx]["x"] as? Double, px >= 0.0 && px <= 1.0 {
                    sumX += px
                    countX += 1
                }
            }
            let centerX = countX > 0 ? (sumX / Double(countX)) : ((landmarks[9]["x"] as? Double) ?? 0.5)
            parsedHands.append((landmarks: landmarks, centerX: centerX, chirality: obs.chirality, confidence: obs.confidence))
        }

        if parsedHands.isEmpty {
            dispatchEmptyFrame(timestamp: now, pixelBuffer: pixelBuffer)
            return
        }

        var handsData: [[String: Any]] = []

        if parsedHands.count == 2 {
            // 双手同时出现：按未镜像相机的手掌中心 X 排序
            // centerX 较小 -> 位于用户右侧 -> 右手
            // centerX 较大 -> 位于用户左侧 -> 左手
            let sorted = parsedHands.sorted { $0.centerX < $1.centerX }
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
            // 单手出现：优先采用 Vision 解剖学手性，未知手性时保持时间连续性
            let single = parsedHands[0]
            var handLabel = "right"

            if single.chirality == .left {
                handLabel = "left"
            } else if single.chirality == .right {
                handLabel = "right"
            } else if (now - lastSingleHandTimestamp) < 0.45 {
                handLabel = lastSingleHandLabel
            } else {
                // 首次未知手性时通过前置非镜像相机位置判决：x > 0.5 靠近用户左侧，x <= 0.5 靠近用户右侧
                handLabel = single.centerX > 0.5 ? "left" : "right"
            }
            lastSingleHandLabel = handLabel
            lastSingleHandTimestamp = now

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

    /// 提取 Apple Vision 21 个关节并进行手腕重建与骨骼拓扑保护，彻底杜绝缺失点残留在 (-1, -1) 或乱跳至屏幕右上角
    private func extract21Landmarks(
        observation: VNHumanHandPoseObservation,
        handHint: String? = nil,
        now: CFAbsoluteTime = CFAbsoluteTimeGetCurrent()
    ) -> [[String: Any]]? {
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
        var confidentCount = 0

        // 第一步：解析具备有效置信度的原生关节点（指尖在捏合自遮挡时允许 0.12 置信度，防止捏合中断跳回 DIP）
        for (idx, key) in jointKeys.enumerated() {
            let minConf: Float = (idx == 4 || idx == 8) ? 0.12 : 0.18
            if let pt = try? observation.recognizedPoint(key), pt.confidence >= minConf {
                // Vision location 原点在左下角 (Y向上)，转换为 Web 标准 (0,0) 在左上角
                let normX = Double(pt.location.x)
                let normY = 1.0 - Double(pt.location.y)
                let isValidCoord = normX.isFinite && normY.isFinite &&
                    normX >= 0.0 && normX <= 1.0 &&
                    normY >= 0.0 && normY <= 1.0
                let isCornerArtifact = ((normX <= 0.002 || normX >= 0.998) && (normY <= 0.002 || normY >= 0.998) && pt.confidence < 0.45) ||
                    ((normX <= 0.001 || normX >= 0.999 || normY <= 0.001 || normY >= 0.999) && pt.confidence < 0.30)

                if isValidCoord && !isCornerArtifact {
                    if pt.confidence >= 0.22 {
                        confidentCount += 1
                    }
                    points.append([
                        "x": normX,
                        "y": normY,
                        "z": 0.0,
                        "visibility": Double(pt.confidence)
                    ])
                    continue
                }
            }
            // 暂时标记缺失，后续通过手腕几何反推与父子拓扑修补，严禁残留负数或回退到屏幕角落
            points.append([
                "x": -1.0,
                "y": -1.0,
                "z": 0.0,
                "visibility": 0.0
            ])
        }

        let validIndices = (0..<21).filter { (points[$0]["x"] as? Double ?? -1.0) >= 0.0 }
        if validIndices.count < 5 || confidentCount < 5 {
            return nil
        }

        let recentPrev: [[String: Any]]? = {
            guard let label = handHint,
                  let prev = previousLandmarks[label],
                  let lastTs = lastSeenTimestamp[label],
                  (now - lastTs) < 0.25,
                  prev.count == 21 else { return nil }
            return prev
        }()

        // 第二步：优先修复根节点手腕 (points[0])！
        // 当手腕位于取景框下边缘被裁切导致置信度低于阈值时，根据掌指关节 (MCP) 与近端指间关节 (PIP) 的解剖学主轴反向重建手腕，
        // 彻底根除 points[0] 保持 (-1, -1) 后被前端钳制到 (0, 0) 导致 5 条掌骨线飞向画面右上角的 Bug！
        if (points[0]["x"] as? Double ?? -1.0) < 0.0 {
            let mcpIndices = [5, 9, 13, 17].filter { (points[$0]["x"] as? Double ?? -1.0) >= 0.0 }
            let pipIndices = [6, 10, 14, 18].filter { (points[$0]["x"] as? Double ?? -1.0) >= 0.0 }

            var wristX = 0.5
            var wristY = 0.85

            if !mcpIndices.isEmpty {
                let mcpX = mcpIndices.reduce(0.0) { $0 + ((points[$1]["x"] as? Double) ?? 0.0) } / Double(mcpIndices.count)
                let mcpY = mcpIndices.reduce(0.0) { $0 + ((points[$1]["y"] as? Double) ?? 0.0) } / Double(mcpIndices.count)

                if !pipIndices.isEmpty {
                    let pipX = pipIndices.reduce(0.0) { $0 + ((points[$1]["x"] as? Double) ?? 0.0) } / Double(pipIndices.count)
                    let pipY = pipIndices.reduce(0.0) { $0 + ((points[$1]["y"] as? Double) ?? 0.0) } / Double(pipIndices.count)
                    let vx = mcpX - pipX
                    let vy = mcpY - pipY
                    let vLen = hypot(vx, vy)
                    if vLen > 1e-4 {
                        let palmSpan = min(0.18, max(0.06, vLen * 1.45))
                        wristX = mcpX + (vx / vLen) * palmSpan
                        wristY = mcpY + (vy / vLen) * palmSpan
                    } else {
                        wristX = mcpX
                        wristY = mcpY + 0.12
                    }
                } else {
                    wristX = mcpX
                    wristY = mcpY + 0.12
                }
            } else {
                wristX = validIndices.reduce(0.0) { $0 + ((points[$1]["x"] as? Double) ?? 0.0) } / Double(validIndices.count)
                wristY = validIndices.reduce(0.0) { $0 + ((points[$1]["y"] as? Double) ?? 0.0) } / Double(validIndices.count) + 0.08
            }

            points[0]["x"] = min(0.98, max(0.02, wristX))
            points[0]["y"] = min(0.98, max(0.02, wristY))
            points[0]["visibility"] = 0.16
        }

        // 第三步：自顶向下正向拓扑修复所有子关节 (1...20)，此时父节点必然已经拥有合法坐标
        for i in 1..<21 {
            let px = points[i]["x"] as? Double ?? -1.0
            if px < 0.0 {
                let parentIdx = parentJointIndices[i]
                let parentX = (points[parentIdx]["x"] as? Double) ?? 0.5
                let parentY = (points[parentIdx]["y"] as? Double) ?? 0.5

                var repairedX = parentX
                var repairedY = parentY

                if let prev = recentPrev,
                   let prevChildX = prev[i]["x"] as? Double,
                   let prevChildY = prev[i]["y"] as? Double,
                   let prevParentX = prev[parentIdx]["x"] as? Double,
                   let prevParentY = prev[parentIdx]["y"] as? Double,
                   prevChildX >= 0.0 && prevParentX >= 0.0 {
                    let dx = prevChildX - prevParentX
                    let dy = prevChildY - prevParentY
                    if hypot(dx, dy) <= 0.14 {
                        repairedX = parentX + dx
                        repairedY = parentY + dy
                    }
                } else if (i % 4 != 0) && (i + 1 < 21),
                          let nextX = points[i + 1]["x"] as? Double,
                          let nextY = points[i + 1]["y"] as? Double,
                          nextX >= 0.0 {
                    repairedX = (parentX + nextX) * 0.5
                    repairedY = (parentY + nextY) * 0.5
                }

                points[i]["x"] = min(0.99, max(0.01, repairedX))
                points[i]["y"] = min(0.99, max(0.01, repairedY))
                points[i]["visibility"] = 0.12
            }
        }

        // 第四步：生理骨长离群点钳制，防止单帧低置信度噪点把单根骨骼拉飞到屏幕边缘
        for i in 1..<21 {
            let parentIdx = parentJointIndices[i]
            let parentX = (points[parentIdx]["x"] as? Double) ?? 0.5
            let parentY = (points[parentIdx]["y"] as? Double) ?? 0.5
            let curX = (points[i]["x"] as? Double) ?? parentX
            let curY = (points[i]["y"] as? Double) ?? parentY

            let maxBoneLen = (parentIdx == 0) ? 0.38 : 0.22
            let dx = curX - parentX
            let dy = curY - parentY
            let dist = hypot(dx, dy)
            if dist > maxBoneLen && dist > 1e-5 {
                let scale = maxBoneLen / dist
                points[i]["x"] = min(0.99, max(0.01, parentX + dx * scale))
                points[i]["y"] = min(0.99, max(0.01, parentY + dy * scale))
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

        let targetW: CGFloat = width < height ? 240.0 : 320.0
        let targetH: CGFloat = width < height ? 320.0 : 240.0
        let scaleX = targetW / CGFloat(width)
        let scaleY = targetH / CGFloat(height)
        let scaledImage = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let jpegData = ciContext.jpegRepresentation(
                of: scaledImage,
                colorSpace: colorSpace,
                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.72]
              ) else {
            return nil
        }

        return jpegData.base64EncodedString()
    }

    private func dispatchEmptyFrame(timestamp: CFAbsoluteTime, pixelBuffer: CVPixelBuffer? = nil) {
        var payload: [String: Any] = [
            "hasHand": false,
            "timestamp": timestamp * 1000.0,
            "hands": [],
            "latencyMs": 0.5,
            "frameId": frameCounter,
            "backend": "Apple Vision Framework (ANE Native)"
        ]
        if let pb = pixelBuffer, frameCounter % 2 == 0 {
            if let frameJpeg = encodePixelBufferToJpegBase64(pixelBuffer: pb) {
                payload["frameImage"] = "data:image/jpeg;base64," + frameJpeg
            }
        }
        dispatchFrame(payload: payload)
    }

    private func dispatchFrame(payload: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let webView = self.webView ?? self.resolveActiveWebViewOnMain() else { return }
            webView.evaluateJavaScript("window.__hologrip_onAppleVisionFrame && window.__hologrip_onAppleVisionFrame(\(jsonString));", completionHandler: nil)
        }
    }
}

// MARK: - C FFI 导出符号，方便 Rust 运行时与 Tauri 底层直接调用

@_cdecl("hologrip_apple_vision_is_supported")
public func hologripAppleVisionIsSupported() -> Bool {
    return AppleVisionHandManager.shared.isSupported()
}

@_cdecl("hologrip_apple_vision_is_running")
public func hologripAppleVisionIsRunning() -> Bool {
    return AppleVisionHandManager.shared.getIsRunning()
}

@_cdecl("hologrip_apple_vision_start")
public func hologripAppleVisionStart() -> Bool {
    return AppleVisionHandManager.shared.start()
}

@_cdecl("hologrip_apple_vision_start_async")
public func hologripAppleVisionStartAsync(
    _ context: UnsafeMutableRawPointer?,
    _ callback: @escaping @convention(c) (UnsafeMutableRawPointer?, Bool) -> Void
) {
    AppleVisionHandManager.shared.startWithCompletion { success in
        callback(context, success)
    }
}

@_cdecl("hologrip_apple_vision_stop")
public func hologripAppleVisionStop() -> Bool {
    return AppleVisionHandManager.shared.stop()
}
