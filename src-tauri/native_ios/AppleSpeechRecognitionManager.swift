import AVFoundation
import Foundation
import Speech
import Tauri
import UIKit

/// One short dictation session shared by the two chemistry input surfaces.
/// All state and permission callbacks are serialized on the main queue.
final class AppleSpeechRecognitionManager {
    private var sessionID: String?
    private var pendingInvoke: Invoke?
    private var audioEngine: AVAudioEngine?
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var transcript = ""
    private var silenceTimeout: DispatchWorkItem?
    private var sessionTimeout: DispatchWorkItem?
    private var installedTap = false
    private var activatedAudioSession = false
    private var previousAudioConfiguration: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
    private var observers: [NSObjectProtocol] = []

    init() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.finish(cancelled: true)
        })
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] notification in
            if notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue {
                self?.finish(error: "audio-capture")
            }
        })
    }

    deinit {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
    }

    func start(id: String, language: String, invoke: Invoke) {
        finish(cancelled: true)
        sessionID = id
        pendingInvoke = invoke
        transcript = ""

        // Missing privacy strings cause iOS to terminate the app before a prompt.
        guard Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") as? String != nil,
              Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") as? String != nil else {
            finish(error: "speech-unavailable")
            return
        }

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self = self, self.sessionID == id else { return }
                guard status == .authorized else {
                    self.finish(error: "not-allowed")
                    return
                }
                AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
                    DispatchQueue.main.async {
                        guard let self = self, self.sessionID == id else { return }
                        guard granted else {
                            self.finish(error: "not-allowed")
                            return
                        }
                        self.beginRecording(id: id, language: language)
                    }
                }
            }
        }
    }

    func stop(id: String) {
        // A delayed stop from the old panel must not cancel a newer session.
        guard sessionID == id else { return }
        finish(cancelled: true)
    }

    private func beginRecording(id: String, language: String) {
        guard UIApplication.shared.applicationState != .background else {
            finish(cancelled: true)
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) else {
            finish(error: "language-not-supported")
            return
        }
        guard recognizer.isAvailable else {
            finish(error: "speech-unavailable")
            return
        }
        self.recognizer = recognizer

        let audioSession = AVAudioSession.sharedInstance()
        previousAudioConfiguration = (audioSession.category, audioSession.mode, audioSession.categoryOptions)
        do {
            try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
            try audioSession.setActive(true)
            activatedAudioSession = true
            let engine = AVAudioEngine()
            audioEngine = engine
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                finish(error: "audio-capture")
                return
            }
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.taskHint = .dictation
            self.request = request
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            installedTap = true
            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self = self, self.sessionID == id else { return }
                    if let result = result {
                        self.transcript = result.bestTranscription.formattedString
                        if result.isFinal {
                            self.finish()
                            return
                        }
                        if !self.transcript.isEmpty {
                            self.silenceTimeout?.cancel()
                            let timeout = DispatchWorkItem { [weak self] in
                                guard let self = self, self.sessionID == id else { return }
                                self.finish()
                            }
                            self.silenceTimeout = timeout
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: timeout)
                        }
                    }
                    if let error = error as NSError? {
                        if !self.transcript.isEmpty { self.finish() }
                        else if error.domain == NSURLErrorDomain { self.finish(error: "network") }
                        else { self.finish(error: error.code == 1110 ? "no-speech" : "speech-unavailable") }
                    }
                }
            }
            engine.prepare()
            try engine.start()
            let timeout = DispatchWorkItem { [weak self] in
                guard let self = self, self.sessionID == id else { return }
                self.finish(error: self.transcript.isEmpty ? "no-speech" : nil)
            }
            sessionTimeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
        } catch {
            finish(error: "audio-capture")
        }
    }

    private func finish(error: String? = nil, cancelled: Bool = false) {
        guard let invoke = pendingInvoke else { return }
        // Invalidate before cancelling the task: cancellation can emit callbacks.
        pendingInvoke = nil
        sessionID = nil
        silenceTimeout?.cancel()
        silenceTimeout = nil
        sessionTimeout?.cancel()
        sessionTimeout = nil
        audioEngine?.stop()
        if installedTap { audioEngine?.inputNode.removeTap(onBus: 0) }
        installedTap = false
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        recognizer = nil
        audioEngine = nil
        if let previous = previousAudioConfiguration {
            let audioSession = AVAudioSession.sharedInstance()
            if activatedAudioSession {
                try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            }
            activatedAudioSession = false
            try? audioSession.setCategory(previous.0, mode: previous.1, options: previous.2)
            previousAudioConfiguration = nil
        }
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        transcript = ""
        if let error = error { invoke.reject(error, code: error) }
        else if !cancelled && text.isEmpty { invoke.reject("no-speech", code: "no-speech") }
        else { invoke.resolve(["transcript": text, "cancelled": cancelled]) }
    }
}
