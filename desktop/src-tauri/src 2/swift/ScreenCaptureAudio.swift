import Foundation
import AVFoundation
import ScreenCaptureKit
import AppKit  // For NSWorkspace

// MARK: - C-compatible callback types
public typealias AudioDataCallback = @convention(c) (UnsafePointer<Float>, Int32, Int32, Int32) -> Void
public typealias ErrorCallback = @convention(c) (UnsafePointer<CChar>) -> Void

// MARK: - Global state for FFI
private var audioCapture: SystemAudioCapture?
private var audioDataCallback: AudioDataCallback?
private var errorCallback: ErrorCallback?

// MARK: - FFI Functions

@_cdecl("sck_is_available")
public func sck_is_available() -> Bool {
    if #available(macOS 13.0, *) {
        return true
    }
    return false
}

@_cdecl("sck_has_permission")
public func sck_has_permission() -> Bool {
    print("[SCK-SWIFT] sck_has_permission() called")
    if #available(macOS 13.0, *) {
        // Check if we have screen recording permission by trying to get shareable content
        let semaphore = DispatchSemaphore(value: 0)
        var hasPermission = false
        var errorMessage: String? = nil

        print("[SCK-SWIFT] Checking Screen Recording permission...")
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
            if let error = error {
                errorMessage = error.localizedDescription
                hasPermission = false
            } else if let content = content {
                hasPermission = !content.displays.isEmpty
                print("[SCK-SWIFT] Found \(content.displays.count) displays")
            }
            semaphore.signal()
        }

        let result = semaphore.wait(timeout: .now() + 2.0)
        if result == .timedOut {
            print("[SCK-SWIFT] WARNING: Permission check timed out")
            return false
        }

        if let error = errorMessage {
            print("[SCK-SWIFT] Permission error: \(error)")
        }
        print("[SCK-SWIFT] Permission result: \(hasPermission)")
        return hasPermission
    }
    print("[SCK-SWIFT] macOS 13.0+ not available")
    return false
}

@_cdecl("sck_request_permission")
public func sck_request_permission() -> Bool {
    if #available(macOS 13.0, *) {
        // Requesting shareable content will trigger the permission dialog
        let semaphore = DispatchSemaphore(value: 0)
        var hasPermission = false

        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
            hasPermission = (error == nil && content != nil)
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 30.0) // Wait longer for user to respond
        return hasPermission
    }
    return false
}

@_cdecl("sck_set_callbacks")
public func sck_set_callbacks(
    audioCallback: AudioDataCallback?,
    errCallback: ErrorCallback?
) {
    audioDataCallback = audioCallback
    errorCallback = errCallback
}

@_cdecl("sck_start_capture")
public func sck_start_capture(outputPath: UnsafePointer<CChar>) -> Bool {
    print("[SCK-SWIFT] sck_start_capture() called")
    if #available(macOS 13.0, *) {
        let path = String(cString: outputPath)
        print("[SCK-SWIFT] Output path: \(path)")

        do {
            audioCapture = try SystemAudioCapture(outputPath: path)
            print("[SCK-SWIFT] SystemAudioCapture created successfully")

            audioCapture?.onAudioData = { samples, frameCount, sampleRate, channels in
                audioDataCallback?(samples, Int32(frameCount), Int32(sampleRate), Int32(channels))
            }
            audioCapture?.onError = { error in
                print("[SCK-SWIFT] Capture error: \(error)")
                error.withCString { ptr in
                    errorCallback?(ptr)
                }
            }

            // Use semaphore to wait for async capture to actually start
            let semaphore = DispatchSemaphore(value: 0)
            var captureStarted = false
            var captureError: String? = nil

            Task {
                do {
                    print("[SCK-SWIFT] Starting capture async...")
                    try await audioCapture?.startCapture()
                    print("[SCK-SWIFT] Capture started successfully")
                    captureStarted = true
                } catch {
                    print("[SCK-SWIFT] Capture start failed: \(error.localizedDescription)")
                    captureError = error.localizedDescription
                    error.localizedDescription.withCString { ptr in
                        errorCallback?(ptr)
                    }
                }
                semaphore.signal()
            }

            // Wait up to 10 seconds for capture to start
            let result = semaphore.wait(timeout: .now() + 10.0)
            if result == .timedOut {
                print("[SCK-SWIFT] Capture start timed out!")
                return false
            }

            if let error = captureError {
                print("[SCK-SWIFT] Capture failed with error: \(error)")
                return false
            }

            print("[SCK-SWIFT] Capture confirmed started: \(captureStarted)")
            return captureStarted
        } catch {
            print("[SCK-SWIFT] Failed to create SystemAudioCapture: \(error.localizedDescription)")
            error.localizedDescription.withCString { ptr in
                errorCallback?(ptr)
            }
            return false
        }
    }
    print("[SCK-SWIFT] macOS 13.0+ not available for capture")
    return false
}

@_cdecl("sck_stop_capture")
public func sck_stop_capture() -> Bool {
    print("[SCK-SWIFT] sck_stop_capture() called")
    if #available(macOS 13.0, *) {
        let semaphore = DispatchSemaphore(value: 0)

        Task {
            print("[SCK-SWIFT] Stopping capture...")
            await audioCapture?.stopCapture()
            print("[SCK-SWIFT] Capture stopped, cleaning up...")
            audioCapture = nil
            semaphore.signal()
        }

        // Wait for stop to complete
        let result = semaphore.wait(timeout: .now() + 5.0)
        if result == .timedOut {
            print("[SCK-SWIFT] Stop capture timed out!")
        } else {
            print("[SCK-SWIFT] Capture stopped successfully")
        }
        return true
    }
    return false
}

@_cdecl("sck_is_recording")
public func sck_is_recording() -> Bool {
    return audioCapture?.isRecording ?? false
}

// MARK: - SystemAudioCapture Implementation

@available(macOS 13.0, *)
class SystemAudioCapture: NSObject, SCStreamDelegate, SCStreamOutput {
    private var stream: SCStream?
    private var fileHandle: FileHandle?
    private let outputPath: String
    private(set) var isRecording = false
    private var samplesWritten: Int = 0
    private var buffersReceived: Int = 0
    private var headerWritten = false

    var onAudioData: ((UnsafePointer<Float>, Int, Int, Int) -> Void)?
    var onError: ((String) -> Void)?

    private let sampleRate: Double = 48000
    private let channelCount: Int = 2

    init(outputPath: String) throws {
        self.outputPath = outputPath
        super.init()
        print("[SCK] SystemAudioCapture initialized with path: \(outputPath)")
    }

    func startCapture() async throws {
        // Get shareable content
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)

        // Get the main display
        guard let display = content.displays.first else {
            throw NSError(domain: "SCK", code: -1, userInfo: [NSLocalizedDescriptionKey: "No display found"])
        }

        // Native video apps (prioritized - these have dedicated call functionality)
        let nativeVideoApps = [
            "com.hnc.Discord",           // Discord
            "com.microsoft.teams",       // Teams (old)
            "com.microsoft.teams2",      // Teams (new)
            "us.zoom.xos",               // Zoom
            "com.tinyspeck.slackmacgap", // Slack
            "com.cisco.webexmeetingsapp" // WebEx
        ]

        // Browser apps (lower priority - only use if no native app is available)
        let browserApps = [
            "com.google.Chrome",         // Chrome (for Meet, etc.)
            "org.mozilla.firefox",       // Firefox
            "com.apple.Safari",          // Safari
            "com.brave.Browser",         // Brave
            "com.microsoft.edgemac",     // Edge
        ]

        // All video apps
        let allVideoApps = nativeVideoApps + browserApps

        // Try to find the frontmost video app and capture only that
        var filter: SCContentFilter

        // Get frontmost app
        let frontmostApp = NSWorkspace.shared.frontmostApplication
        let frontmostBundleId = frontmostApp?.bundleIdentifier ?? ""
        print("[SCK] Frontmost app: \(frontmostApp?.localizedName ?? "unknown") (\(frontmostBundleId))")

        // Find all active native video apps
        let activeNativeApps = content.applications.filter { app in
            nativeVideoApps.contains(app.bundleIdentifier)
        }
        print("[SCK] Active native video apps: \(activeNativeApps.map { $0.applicationName })")

        // Determine which app to capture
        var targetApp: SCRunningApplication? = nil

        // Check if frontmost is a native video app
        if nativeVideoApps.contains(frontmostBundleId),
           let app = content.applications.first(where: { $0.bundleIdentifier == frontmostBundleId }) {
            print("[SCK] Frontmost is a native video app: \(app.applicationName)")
            targetApp = app
        }
        // If frontmost is a browser but there's a native video app running, prefer the native app
        else if browserApps.contains(frontmostBundleId), let nativeApp = activeNativeApps.first {
            print("[SCK] Frontmost is browser but native video app (\(nativeApp.applicationName)) is running - using native app")
            targetApp = nativeApp
        }
        // If frontmost is a browser and no native apps, use the browser
        else if browserApps.contains(frontmostBundleId),
                let app = content.applications.first(where: { $0.bundleIdentifier == frontmostBundleId }) {
            print("[SCK] Frontmost is browser, no native video apps - using browser: \(app.applicationName)")
            targetApp = app
        }
        // Frontmost is not a video app at all - try to find any native video app
        else if let nativeApp = activeNativeApps.first {
            print("[SCK] Frontmost is not a video app, using native video app: \(nativeApp.applicationName)")
            targetApp = nativeApp
        }
        // Last resort - try any video app
        else if let anyVideoApp = content.applications.first(where: { allVideoApps.contains($0.bundleIdentifier) }) {
            print("[SCK] Using fallback video app: \(anyVideoApp.applicationName)")
            targetApp = anyVideoApp
        }

        // Capture the target app's window
        if let app = targetApp {
            print("[SCK] Target app for capture: \(app.applicationName) (\(app.bundleIdentifier))")

            // Find the main window of the app (largest visible window)
            let appWindows = content.windows.filter {
                $0.owningApplication?.bundleIdentifier == app.bundleIdentifier && $0.isOnScreen
            }
            print("[SCK] Found \(appWindows.count) on-screen windows for \(app.applicationName)")

            if let mainWindow = appWindows.max(by: { ($0.frame.width * $0.frame.height) < ($1.frame.width * $1.frame.height) }) {
                // Capture just this window - indicator will only show on this window
                print("[SCK] Capturing window: \(mainWindow.title ?? "untitled") (\(Int(mainWindow.frame.width))x\(Int(mainWindow.frame.height)))")
                filter = SCContentFilter(desktopIndependentWindow: mainWindow)
                print("[SCK] ✅ Using single-window capture for \(app.applicationName) (indicator on this window only)")
            } else {
                // Fallback: capture the whole app
                print("[SCK] No visible windows found, capturing app audio via display filter")
                filter = SCContentFilter(display: display, including: [app], exceptingWindows: [])
                print("[SCK] Using app-specific capture for: \(app.applicationName)")
            }
        } else {
            // No video apps found - fallback to display capture
            print("[SCK] No video apps found, using display capture (all apps)")
            filter = SCContentFilter(display: display, excludingWindows: [])
        }

        print("[SCK] Filter configured")

        // Configure stream for audio only
        let config = SCStreamConfiguration()
        config.width = 2 // Minimum size since we only want audio
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps minimum
        config.showsCursor = false
        config.capturesAudio = true
        config.sampleRate = Int(sampleRate)
        config.channelCount = channelCount
        config.excludesCurrentProcessAudio = true

        print("[SCK] Audio config: sampleRate=\(sampleRate), channels=\(channelCount), excludeCurrentProcess=true")

        // Create raw PCM file (will write WAV header at the end)
        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: outputPath) {
            try fileManager.removeItem(atPath: outputPath)
        }
        fileManager.createFile(atPath: outputPath, contents: nil, attributes: nil)
        fileHandle = try FileHandle(forWritingTo: URL(fileURLWithPath: outputPath))

        // Write placeholder WAV header (44 bytes) - will be updated on stop
        let placeholderHeader = Data(count: 44)
        try fileHandle?.write(contentsOf: placeholderHeader)
        headerWritten = false
        samplesWritten = 0
        buffersReceived = 0

        print("[SCK] Audio file created: \(outputPath)")

        // Create and start the stream
        stream = SCStream(filter: filter, configuration: config, delegate: self)

        try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))

        try await stream?.startCapture()
        isRecording = true

        print("ScreenCaptureKit: Audio capture started")
    }

    func stopCapture() async {
        guard isRecording else { return }

        print("[SCK] Stopping capture...")
        print("[SCK] Total buffers received: \(buffersReceived)")
        print("[SCK] Total samples written: \(samplesWritten)")

        do {
            try await stream?.stopCapture()
        } catch {
            print("[SCK] Error stopping stream: \(error)")
        }

        // Write proper WAV header
        if let fileHandle = fileHandle {
            do {
                // Calculate sizes
                let dataSize = UInt32(samplesWritten * 2)  // 16-bit = 2 bytes per sample
                let fileSize = dataSize + 36  // WAV header minus 8 bytes

                // Seek to beginning
                try fileHandle.seek(toOffset: 0)

                // Build WAV header
                var header = Data()

                // RIFF header
                header.append(contentsOf: "RIFF".utf8)
                header.append(contentsOf: withUnsafeBytes(of: fileSize.littleEndian) { Array($0) })
                header.append(contentsOf: "WAVE".utf8)

                // fmt chunk
                header.append(contentsOf: "fmt ".utf8)
                header.append(contentsOf: withUnsafeBytes(of: UInt32(16).littleEndian) { Array($0) })  // chunk size
                header.append(contentsOf: withUnsafeBytes(of: UInt16(1).littleEndian) { Array($0) })   // PCM format
                header.append(contentsOf: withUnsafeBytes(of: UInt16(channelCount).littleEndian) { Array($0) })
                header.append(contentsOf: withUnsafeBytes(of: UInt32(sampleRate).littleEndian) { Array($0) })
                let byteRate = UInt32(sampleRate) * UInt32(channelCount) * 2  // 16-bit
                header.append(contentsOf: withUnsafeBytes(of: byteRate.littleEndian) { Array($0) })
                let blockAlign = UInt16(channelCount) * 2  // 16-bit
                header.append(contentsOf: withUnsafeBytes(of: blockAlign.littleEndian) { Array($0) })
                header.append(contentsOf: withUnsafeBytes(of: UInt16(16).littleEndian) { Array($0) })  // bits per sample

                // data chunk
                header.append(contentsOf: "data".utf8)
                header.append(contentsOf: withUnsafeBytes(of: dataSize.littleEndian) { Array($0) })

                try fileHandle.write(contentsOf: header)
                try fileHandle.close()
                print("[SCK] WAV header written, file closed. Data size: \(dataSize) bytes")
            } catch {
                print("[SCK] Error writing WAV header: \(error)")
            }
        }

        stream = nil
        fileHandle = nil
        isRecording = false

        print("[SCK] Audio capture stopped")
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, isRecording else { return }

        buffersReceived += 1

        // Log every 100 buffers
        if buffersReceived % 100 == 1 {
            print("[SCK] Audio buffer #\(buffersReceived)")
        }

        // Get format description
        guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc) else {
            return
        }

        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        let inputChannels = Int(asbd.pointee.mChannelsPerFrame)

        // Log format on first buffer
        if buffersReceived == 1 {
            print("[SCK] Input: \(asbd.pointee.mSampleRate) Hz, \(inputChannels) ch, \(asbd.pointee.mBitsPerChannel) bits")
        }

        // Get the raw audio data
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        let status = CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)

        guard status == kCMBlockBufferNoErr, let data = dataPointer else { return }

        // ScreenCaptureKit provides Float32 interleaved audio
        // Convert to Int16 for WAV file
        let floatPtr = UnsafeRawPointer(data).bindMemory(to: Float.self, capacity: length / 4)
        let floatCount = length / 4

        // Calculate audio level for debugging (RMS)
        var sumSquares: Float = 0
        var maxSample: Float = 0
        for i in 0..<floatCount {
            let sample = abs(floatPtr[i])
            sumSquares += sample * sample
            if sample > maxSample { maxSample = sample }
        }
        let rms = sqrt(sumSquares / Float(floatCount))

        // Log audio levels every 100 buffers
        if buffersReceived % 100 == 1 {
            let rmsDb = 20 * log10(max(rms, 0.00001))
            let peakDb = 20 * log10(max(maxSample, 0.00001))
            print("[SCK] Audio level - RMS: \(String(format: "%.1f", rmsDb)) dB, Peak: \(String(format: "%.1f", peakDb)) dB")
        }

        // Create Int16 buffer
        var int16Data = Data(capacity: floatCount * 2)

        for i in 0..<floatCount {
            // Clamp and convert float to int16
            let sample = floatPtr[i]
            let clamped = max(-1.0, min(1.0, sample))
            let int16Sample = Int16(clamped * 32767.0)
            withUnsafeBytes(of: int16Sample.littleEndian) { int16Data.append(contentsOf: $0) }
        }

        // Write to file
        do {
            try fileHandle?.write(contentsOf: int16Data)
            samplesWritten += floatCount  // Each float becomes one int16 sample
        } catch {
            print("[SCK] Write error: \(error)")
        }

        if buffersReceived % 100 == 0 {
            print("[SCK] Written \(samplesWritten) samples")
        }
    }

    // MARK: - SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("Stream stopped with error: \(error)")
        isRecording = false
        onError?(error.localizedDescription)
    }
}
