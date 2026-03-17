import Foundation
import AVFoundation
import ScreenCaptureKit
import AppKit  // For NSWorkspace
import CoreAudio  // Pour lire le sample rate natif du device de sortie (fix AirPods)
import CoreGraphics  // Pour CGPreflightScreenCaptureAccess / CGRequestScreenCaptureAccess
import UserNotifications  // Pour les notifications natives avec boutons d'action

// MARK: - C-compatible callback types
public typealias AudioDataCallback = @convention(c) (UnsafePointer<Float>, Int32, Int32, Int32) -> Void
public typealias ErrorCallback = @convention(c) (UnsafePointer<CChar>) -> Void

// MARK: - Global state for FFI
private var audioCapture: SystemAudioCapture?
private var audioDataCallback: AudioDataCallback?
private var errorCallback: ErrorCallback?

// Permission state — évite de redemander en boucle si refusée
private var permissionAlreadyRequested = false
private var cachedPermissionResult: Bool? = nil
// Flag : la capture a déjà réussi au moins une fois dans cette session → permission OK
private var captureEverSucceeded = false

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

    // Si la capture a déjà réussi dans cette session, la permission est forcément OK
    if captureEverSucceeded { return true }

    // 1. CGPreflightScreenCaptureAccess : vérification SILENCIEUSE qui lit TCC directement.
    let granted = CGPreflightScreenCaptureAccess()
    if granted {
        cachedPermissionResult = true
        UserDefaults.standard.set(true, forKey: "gilbert.screen_recording_granted")
        print("[SCK-SWIFT] Permission: granted via TCC ✅")
        return true
    }

    // 2. Vérifier si on a déjà accordé dans une session précédente via UserDefaults
    //    UserDefaults persiste même si TCC retourne false (bug connu macOS)
    if UserDefaults.standard.bool(forKey: "gilbert.screen_recording_granted") {
        print("[SCK-SWIFT] Permission: previously granted (UserDefaults) — skip popup")
        return true
    }

    // 3. Tenter un accès SCShareableContent silencieux pour détecter si la permission
    //    est accordée mais CGPreflightScreenCaptureAccess() retourne un faux négatif
    //    (bug connu sur macOS 14+ avec certains TeamIdentifier)
    if #available(macOS 13.0, *) {
        var silentGranted = false
        let sema = DispatchSemaphore(value: 0)
        Task {
            do {
                _ = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
                silentGranted = true
                print("[SCK-SWIFT] Permission: granted via SCShareableContent silent check ✅")
            } catch {
                print("[SCK-SWIFT] Permission: SCShareableContent check failed: \(error.localizedDescription)")
            }
            sema.signal()
        }
        _ = sema.wait(timeout: .now() + 3.0)
        if silentGranted {
            captureEverSucceeded = true
            UserDefaults.standard.set(true, forKey: "gilbert.screen_recording_granted")
            return true
        }
    }

    print("[SCK-SWIFT] Permission: not granted")
    return false
}

@_cdecl("sck_request_permission")
public func sck_request_permission() -> Bool {
    print("[SCK-SWIFT] sck_request_permission() called")

    // Si la capture a déjà réussi → permission OK
    if captureEverSucceeded { return true }

    // Vérifier d'abord silencieusement via TCC
    if CGPreflightScreenCaptureAccess() {
        cachedPermissionResult = true
        permissionAlreadyRequested = true
        UserDefaults.standard.set(true, forKey: "gilbert.screen_recording_granted")
        print("[SCK-SWIFT] Permission already granted ✅")
        return true
    }

    // UserDefaults : accordé dans une session précédente → skip popup
    if UserDefaults.standard.bool(forKey: "gilbert.screen_recording_granted") {
        print("[SCK-SWIFT] Permission previously granted (UserDefaults) — skipping popup ✅")
        permissionAlreadyRequested = true
        return true
    }

    // Ne pas redemander si déjà tenté cette session
    if permissionAlreadyRequested {
        print("[SCK-SWIFT] Already requested this session, skipping")
        return false
    }
    permissionAlreadyRequested = true

    // CGRequestScreenCaptureAccess : affiche la popup système UNE SEULE FOIS
    print("[SCK-SWIFT] Requesting Screen Recording permission via CGRequestScreenCaptureAccess...")
    let granted = CGRequestScreenCaptureAccess()
    cachedPermissionResult = granted
    if granted {
        UserDefaults.standard.set(true, forKey: "gilbert.screen_recording_granted")
    }
    print("[SCK-SWIFT] Permission request result: \(granted)")
    return granted
}

// MARK: - Microphone permission (TCC persistant)

@_cdecl("request_microphone_permission")
public func request_microphone_permission() {
    let status = AVCaptureDevice.authorizationStatus(for: .audio)
    switch status {
    case .authorized:
        UserDefaults.standard.set(true, forKey: "gilbert.microphone_granted")
        print("[PERMISSIONS] Microphone already granted ✅")
        return
    case .notDetermined:
        // Vérifier UserDefaults (persistance inter-builds)
        if UserDefaults.standard.bool(forKey: "gilbert.microphone_granted") {
            print("[PERMISSIONS] Microphone previously granted (UserDefaults) ✅")
            return
        }
        print("[PERMISSIONS] Requesting microphone access...")
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            if granted {
                UserDefaults.standard.set(true, forKey: "gilbert.microphone_granted")
            }
            print("[PERMISSIONS] Microphone: \(granted ? "✅ granted" : "⚠️ denied")")
        }
    case .denied, .restricted:
        print("[PERMISSIONS] Microphone denied — user must enable in System Settings")
    @unknown default:
        break
    }
}

@_cdecl("has_microphone_permission")
public func has_microphone_permission() -> Bool {
    let granted = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
    // Également vérifier UserDefaults pour inter-builds
    if !granted && UserDefaults.standard.bool(forKey: "gilbert.microphone_granted") {
        return true
    }
    if granted {
        UserDefaults.standard.set(true, forKey: "gilbert.microphone_granted")
    }
    return granted
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

// MARK: - Debug Logging Helper
private func sckDebugLog(_ message: String) {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let logMessage = "[\(timestamp)] \(message)\n"

    // Print to stdout
    print(message)
    fflush(stdout)

    // Also write to a debug file
    let logPath = "/tmp/gilbert_sck_debug.log"
    if let data = logMessage.data(using: .utf8) {
        if FileManager.default.fileExists(atPath: logPath) {
            if let handle = FileHandle(forWritingAtPath: logPath) {
                handle.seekToEndOfFile()
                handle.write(data)
                handle.closeFile()
            }
        } else {
            FileManager.default.createFile(atPath: logPath, contents: data, attributes: nil)
        }
    }
}

// MARK: - Audio Level Callback for UI
public typealias AudioLevelCallback = @convention(c) (Float, Float) -> Void
private var audioLevelCallback: AudioLevelCallback?

@_cdecl("sck_set_audio_level_callback")
public func sck_set_audio_level_callback(callback: AudioLevelCallback?) {
    audioLevelCallback = callback
    sckDebugLog("[SCK] Audio level callback set: \(callback != nil)")
}

@_cdecl("sck_get_current_audio_level")
public func sck_get_current_audio_level() -> Float {
    return audioCapture?.currentRmsLevel ?? 0.0
}

// MARK: - CoreAudio Helper: Native output device sample rate

/// Retourne le sample rate natif du device de sortie courant (haut-parleurs, AirPods, etc.)
/// Ceci est crucial pour éviter le silence avec les AirPods :
/// SCStreamConfiguration.sampleRate doit correspondre au sample rate du device de sortie
func getNativeOutputSampleRate() -> Double {
    var defaultOutputID: AudioDeviceID = kAudioObjectUnknown
    var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)

    var defaultOutputAddress = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )

    let statusDevice = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &defaultOutputAddress,
        0, nil,
        &propertySize, &defaultOutputID
    )

    guard statusDevice == noErr, defaultOutputID != kAudioObjectUnknown else {
        print("[SCK] Could not get default output device, using 48000 Hz")
        return 48000
    }

    var sampleRate: Float64 = 0
    var sampleRateSize = UInt32(MemoryLayout<Float64>.size)
    var sampleRateAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyNominalSampleRate,
        mScope: kAudioObjectPropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )

    let statusRate = AudioObjectGetPropertyData(
        defaultOutputID,
        &sampleRateAddress,
        0, nil,
        &sampleRateSize, &sampleRate
    )

    guard statusRate == noErr, sampleRate > 0 else {
        print("[SCK] Could not get sample rate for output device, using 48000 Hz")
        return 48000
    }

    // SCKit supporte 48000 ou 44100 — arrondir au plus proche supporté
    let supported: [Double] = [44100, 48000]
    let nearest = supported.min(by: { abs($0 - sampleRate) < abs($1 - sampleRate) }) ?? 48000
    print("[SCK] Output device native rate: \(sampleRate) Hz → using \(nearest) Hz for SCKit")
    return nearest
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

    // Audio level monitoring for UI
    private(set) var currentRmsLevel: Float = 0.0
    private(set) var currentPeakLevel: Float = 0.0
    private var silentBuffersCount: Int = 0
    private var totalBytesWritten: Int = 0

    var onAudioData: ((UnsafePointer<Float>, Int, Int, Int) -> Void)?
    var onError: ((String) -> Void)?

    // Sample rate déterminé dynamiquement au démarrage selon le device de sortie
    // (évite le bug de silence avec AirPods qui peuvent tourner en 44100 Hz)
    private var actualSampleRate: Double = 48000
    private let channelCount: Int = 2

    init(outputPath: String) throws {
        self.outputPath = outputPath
        super.init()
        sckDebugLog("[SCK] SystemAudioCapture initialized with path: \(outputPath)")
    }

    func startCapture() async throws {
        // Récupérer le contenu partageable.
        // On utilise excludingDesktopWindows:true + onScreenWindowsOnly:true
        // pour minimiser les permissions demandées (audio-only, pas besoin de voir les fenêtres).
        // Si déjà accordé, SCK ne redemande JAMAIS la permission.
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        } catch {
            // Fallback : essayer avec les paramètres complets si le premier échoue
            sckDebugLog("[SCK] Fallback to full shareable content")
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        }

        // Get the main display
        guard let display = content.displays.first else {
            throw NSError(domain: "SCK", code: -1, userInfo: [NSLocalizedDescriptionKey: "No display found"])
        }

        sckDebugLog("[SCK] Display found: \(display.width)x\(display.height)")

        // Exclure notre propre application pour éviter les boucles de feedback
        let gilbertApp = content.applications.first(where: {
            $0.bundleIdentifier.contains("gilbert") ||
            $0.applicationName.lowercased().contains("gilbert")
        })

        let filter: SCContentFilter
        if let gilbertApp = gilbertApp {
            sckDebugLog("[SCK] Excluding Gilbert app from capture: \(gilbertApp.applicationName)")
            filter = SCContentFilter(display: display, excludingApplications: [gilbertApp], exceptingWindows: [])
        } else {
            sckDebugLog("[SCK] Using full display capture (Gilbert not found in app list)")
            filter = SCContentFilter(display: display, excludingWindows: [])
        }

        sckDebugLog("[SCK] Filter configured")

        // Détecter le sample rate réel du device de sortie courant (AirPods, haut-parleurs, etc.)
        // Si on force 48000 Hz mais que les AirPods tournent en 44100 Hz → buffers silencieux
        let nativeSampleRate = getNativeOutputSampleRate()
        actualSampleRate = nativeSampleRate
        sckDebugLog("[SCK] Native output device sample rate: \(nativeSampleRate) Hz")

        // Configure stream pour audio uniquement
        // IMPORTANT: ne PAS forcer le sampleRate — laisser SCKit utiliser le taux natif
        // évite le bug de silence avec AirPods/Bluetooth
        let config = SCStreamConfiguration()
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        config.showsCursor = false
        config.capturesAudio = true
        // Utiliser le sample rate natif du device de sortie pour éviter le silence avec AirPods
        config.sampleRate = Int(nativeSampleRate)
        config.channelCount = channelCount
        config.excludesCurrentProcessAudio = true

        sckDebugLog("[SCK] Audio config: sampleRate=\(nativeSampleRate) (native), channels=\(channelCount), excludeCurrentProcess=true")

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

        sckDebugLog("[SCK] Audio file created: \(outputPath)")

        // Create and start the stream
        stream = SCStream(filter: filter, configuration: config, delegate: self)

        try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))

        try await stream?.startCapture()
        isRecording = true
        captureEverSucceeded = true  // La permission est OK — ne plus jamais redemander
        UserDefaults.standard.set(true, forKey: "gilbert.screen_recording_granted")

        print("ScreenCaptureKit: Audio capture started")
    }

    func stopCapture() async {
        guard isRecording else { return }

        sckDebugLog("[SCK] ==========================================")
        sckDebugLog("[SCK] STOPPING CAPTURE - FINAL STATS")
        sckDebugLog("[SCK] ==========================================")
        sckDebugLog("[SCK] Total buffers received: \(buffersReceived)")
        sckDebugLog("[SCK] Total samples written: \(samplesWritten)")
        sckDebugLog("[SCK] Total bytes written: \(totalBytesWritten)")
        sckDebugLog("[SCK] Silent buffers: \(silentBuffersCount)/\(buffersReceived) (\(buffersReceived > 0 ? silentBuffersCount * 100 / buffersReceived : 0)%)")
        sckDebugLog("[SCK] Output file: \(outputPath)")

        do {
            try await stream?.stopCapture()
        } catch {
            sckDebugLog("[SCK] Error stopping stream: \(error)")
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
                header.append(contentsOf: withUnsafeBytes(of: UInt32(actualSampleRate).littleEndian) { Array($0) })
                let byteRate = UInt32(actualSampleRate) * UInt32(channelCount) * 2  // 16-bit
                header.append(contentsOf: withUnsafeBytes(of: byteRate.littleEndian) { Array($0) })
                let blockAlign = UInt16(channelCount) * 2  // 16-bit
                header.append(contentsOf: withUnsafeBytes(of: blockAlign.littleEndian) { Array($0) })
                header.append(contentsOf: withUnsafeBytes(of: UInt16(16).littleEndian) { Array($0) })  // bits per sample

                // data chunk
                header.append(contentsOf: "data".utf8)
                header.append(contentsOf: withUnsafeBytes(of: dataSize.littleEndian) { Array($0) })

                try fileHandle.write(contentsOf: header)
                try fileHandle.close()

                // Log final file size
                let fileManager = FileManager.default
                if let attrs = try? fileManager.attributesOfItem(atPath: outputPath),
                   let fileSize = attrs[.size] as? UInt64 {
                    sckDebugLog("[SCK] WAV header written, file closed.")
                    sckDebugLog("[SCK] Final file size: \(fileSize) bytes (expected ~\(dataSize + 44) bytes)")

                    if fileSize < 1000 {
                        sckDebugLog("[SCK] WARNING: File is very small (\(fileSize) bytes). Audio may not have been captured!")
                    } else if dataSize == 0 {
                        sckDebugLog("[SCK] WARNING: No audio data was written to file!")
                    }
                } else {
                    sckDebugLog("[SCK] WAV header written, file closed. Data size: \(dataSize) bytes")
                }
            } catch {
                sckDebugLog("[SCK] Error writing WAV header: \(error)")
            }
        }

        stream = nil
        fileHandle = nil
        isRecording = false

        sckDebugLog("[SCK] ==========================================")
        sckDebugLog("[SCK] Audio capture stopped")
        sckDebugLog("[SCK] ==========================================")
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, isRecording else { return }

        buffersReceived += 1

        // Log every 50 buffers for more detailed monitoring
        let shouldLog = buffersReceived % 50 == 1 || buffersReceived <= 5

        if shouldLog {
            sckDebugLog("[SCK] Audio buffer #\(buffersReceived)")
        }

        // Get format description
        guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc) else {
            sckDebugLog("[SCK] ERROR: Could not get format description for buffer #\(buffersReceived)")
            return
        }

        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        let inputChannels = Int(asbd.pointee.mChannelsPerFrame)
        let inputSampleRate = asbd.pointee.mSampleRate
        let bitsPerChannel = asbd.pointee.mBitsPerChannel
        let formatFlags = asbd.pointee.mFormatFlags

        // Log format on first few buffers
        if buffersReceived <= 3 {
            sckDebugLog("[SCK] Buffer #\(buffersReceived) format: \(inputSampleRate) Hz, \(inputChannels) ch, \(bitsPerChannel) bits, flags=\(formatFlags), frames=\(frameCount)")
        }

        // Get audio data from CMSampleBuffer using CMBlockBuffer (simpler and safer)
        // ScreenCaptureKit provides NON-INTERLEAVED Float32 audio (flags=41)
        // For non-interleaved stereo: data layout is [L0,L1,...,Ln,R0,R1,...,Rn]

        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else {
            sckDebugLog("[SCK] ERROR: Could not get block buffer for buffer #\(buffersReceived)")
            return
        }

        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        let status = CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)

        guard status == kCMBlockBufferNoErr, let data = dataPointer, length > 0 else {
            sckDebugLog("[SCK] ERROR: Could not get data pointer, status=\(status)")
            return
        }

        let floatPtr = UnsafeRawPointer(data).bindMemory(to: Float.self, capacity: length / 4)
        let totalFloats = length / 4

        // For non-interleaved stereo (flags=41), the data is:
        // [Left channel samples...][Right channel samples...]
        // Each channel has totalFloats/2 samples
        let isNonInterleaved = (formatFlags & kAudioFormatFlagIsNonInterleaved) != 0
        let numChannels = inputChannels

        if shouldLog && buffersReceived <= 3 {
            sckDebugLog("[SCK] Block buffer: \(length) bytes, \(totalFloats) floats, non-interleaved=\(isNonInterleaved), channels=\(numChannels)")
        }

        let samplesPerChannel: Int
        if isNonInterleaved && numChannels > 1 {
            samplesPerChannel = totalFloats / numChannels
        } else {
            samplesPerChannel = totalFloats / max(numChannels, 1)
        }

        // Calculate RMS from first channel for level monitoring
        var sumSquares: Float = 0
        var maxSample: Float = 0
        var nonZeroSamples: Int = 0

        for i in 0..<min(samplesPerChannel, totalFloats) {
            let sample = Swift.abs(floatPtr[i])
            sumSquares += sample * sample
            if sample > maxSample { maxSample = sample }
            if sample > 0.0001 { nonZeroSamples += 1 }
        }

        let rms = sqrt(sumSquares / Float(max(samplesPerChannel, 1)))
        let rmsDb = 20 * log10(max(rms, 0.00001))
        let peakDb = 20 * log10(max(maxSample, 0.00001))

        // Update current levels for UI
        currentRmsLevel = rms
        currentPeakLevel = maxSample
        audioLevelCallback?(rms, maxSample)

        // Track silent buffers
        if rmsDb < -60 {
            silentBuffersCount += 1
        }

        // Log audio levels
        if shouldLog {
            let nonZeroPercent = samplesPerChannel > 0 ? Float(nonZeroSamples) / Float(samplesPerChannel) * 100 : 0
            sckDebugLog("[SCK] Audio level - RMS: \(String(format: "%.1f", rmsDb)) dB, Peak: \(String(format: "%.1f", peakDb)) dB, NonZero: \(String(format: "%.1f", nonZeroPercent))%")
            sckDebugLog("[SCK] Stats: \(silentBuffersCount)/\(buffersReceived) silent buffers, \(totalBytesWritten) bytes written")
        }

        if buffersReceived == 100 && silentBuffersCount > 90 {
            sckDebugLog("[SCK] WARNING: \(silentBuffersCount)/100 buffers are silent! Check if system audio is playing.")
            onError?("Warning: Most audio buffers are silent. Make sure system audio is playing.")
        }

        // Create interleaved Int16 buffer for WAV output
        var int16Data = Data(capacity: samplesPerChannel * numChannels * 2)

        if isNonInterleaved && numChannels == 2 {
            // Non-interleaved stereo: [L0..Ln][R0..Rn] -> interleave to [L0,R0,L1,R1,...]
            for i in 0..<samplesPerChannel {
                // Left channel sample
                let leftSample = floatPtr[i]
                let leftClamped = max(-1.0, min(1.0, leftSample))
                let leftInt16 = Int16(leftClamped * 32767.0)
                withUnsafeBytes(of: leftInt16.littleEndian) { int16Data.append(contentsOf: $0) }

                // Right channel sample (offset by samplesPerChannel)
                let rightIdx = samplesPerChannel + i
                let rightSample = rightIdx < totalFloats ? floatPtr[rightIdx] : leftSample
                let rightClamped = max(-1.0, min(1.0, rightSample))
                let rightInt16 = Int16(rightClamped * 32767.0)
                withUnsafeBytes(of: rightInt16.littleEndian) { int16Data.append(contentsOf: $0) }
            }
        } else {
            // Already interleaved or mono - just convert to Int16
            for i in 0..<totalFloats {
                let sample = floatPtr[i]
                let clamped = max(-1.0, min(1.0, sample))
                let int16Sample = Int16(clamped * 32767.0)
                withUnsafeBytes(of: int16Sample.littleEndian) { int16Data.append(contentsOf: $0) }
            }
        }

        // Write to file
        do {
            try fileHandle?.write(contentsOf: int16Data)
            samplesWritten += int16Data.count / 2  // Each sample is 2 bytes
            totalBytesWritten += int16Data.count
        } catch {
            sckDebugLog("[SCK] Write error: \(error)")
        }

        if buffersReceived % 50 == 0 {
            sckDebugLog("[SCK] Progress: \(samplesWritten) samples, \(totalBytesWritten) bytes written to file")
        }
    }

    // Helper function to process interleaved audio data (fallback)
    private func processAudioData(floatPtr: UnsafePointer<Float>, floatCount: Int, shouldLog: Bool) {
        var sumSquares: Float = 0
        var maxSample: Float = 0
        var nonZeroSamples: Int = 0

        for i in 0..<floatCount {
            let sample = abs(floatPtr[i])
            sumSquares += sample * sample
            if sample > maxSample { maxSample = sample }
            if sample > 0.0001 { nonZeroSamples += 1 }
        }

        let rms = sqrt(sumSquares / Float(max(floatCount, 1)))
        let rmsDb = 20 * log10(max(rms, 0.00001))
        let peakDb = 20 * log10(max(maxSample, 0.00001))

        currentRmsLevel = rms
        currentPeakLevel = maxSample
        audioLevelCallback?(rms, maxSample)

        if rmsDb < -60 {
            silentBuffersCount += 1
        }

        if shouldLog {
            let nonZeroPercent = floatCount > 0 ? Float(nonZeroSamples) / Float(floatCount) * 100 : 0
            sckDebugLog("[SCK] Audio level - RMS: \(String(format: "%.1f", rmsDb)) dB, Peak: \(String(format: "%.1f", peakDb)) dB, NonZero: \(String(format: "%.1f", nonZeroPercent))%")
            sckDebugLog("[SCK] Stats: \(silentBuffersCount)/\(buffersReceived) silent buffers, \(totalBytesWritten) bytes written")
        }

        var int16Data = Data(capacity: floatCount * 2)
        for i in 0..<floatCount {
            let sample = floatPtr[i]
            let clamped = max(-1.0, min(1.0, sample))
            let int16Sample = Int16(clamped * 32767.0)
            withUnsafeBytes(of: int16Sample.littleEndian) { int16Data.append(contentsOf: $0) }
        }

        do {
            try fileHandle?.write(contentsOf: int16Data)
            samplesWritten += floatCount
            totalBytesWritten += int16Data.count
        } catch {
            sckDebugLog("[SCK] Write error: \(error)")
        }
    }

    // MARK: - SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("Stream stopped with error: \(error)")
        isRecording = false
        onError?(error.localizedDescription)
    }
}

// MARK: - Native UNUserNotification avec boutons d'action (style Notion)

/// Callback appelé depuis Swift quand l'user clique "Enregistrer" sur une notification
public typealias NotificationActionCallback = @convention(c) () -> Void
private var notificationActionCallback: NotificationActionCallback?

/// Delegate qui capture les clics sur les boutons de notification
private class GilbertNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    // Notification reçue quand l'app est en foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                 willPresent notification: UNNotification,
                                 withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Toujours afficher la bannière même si l'app est au premier plan
        completionHandler([.banner, .sound])
    }

    // Action choisie par l'utilisateur
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                 didReceive response: UNNotificationResponse,
                                 withCompletionHandler completionHandler: @escaping () -> Void) {
        print("[NOTIF-SWIFT] Action reçue: \(response.actionIdentifier)")
        // Bouton "Enregistrer" OU tap sur la notification → compact + enregistrement
        if response.actionIdentifier == "RECORD_ACTION" || response.actionIdentifier == UNNotificationDefaultActionIdentifier {
            print("[NOTIF-SWIFT] → Enregistrer/tap notif, callback Rust")
            DispatchQueue.main.async {
                notificationActionCallback?()
            }
        }
        completionHandler()
    }
}

private var gilbertNotifDelegate: GilbertNotificationDelegate?

/// Enregistre le callback Rust à appeler quand l'user clique "Enregistrer"
@_cdecl("set_notification_action_callback")
public func set_notification_action_callback(callback: NotificationActionCallback?) {
    notificationActionCallback = callback
    install_notification_delegate()
}

/// Demande la permission notifications macOS (UNUserNotificationCenter)
/// Doit être appelée au démarrage de l'app (avant d'envoyer des notifications)
@_cdecl("request_notification_permission")
public func request_notification_permission() {
    install_notification_delegate()
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
        if let error = error {
            print("[NOTIF-SWIFT] Erreur permission: \(error)")
        } else {
            print("[NOTIF-SWIFT] Permission notifications: \(granted ? "✅ accordée" : "⚠️ refusée")")
        }
    }
}

/// Installe le delegate UNUserNotificationCenter — peut être rappelé plusieurs fois sans danger
/// Tauri peut écraser le delegate après l'init — on expose cette fonction pour le réinstaller
@_cdecl("reinstall_notification_delegate")
public func reinstall_notification_delegate() {
    install_notification_delegate()
    print("[NOTIF-SWIFT] Delegate réinstallé ✅")
}

private func install_notification_delegate() {
    DispatchQueue.main.async {
        if gilbertNotifDelegate == nil {
            gilbertNotifDelegate = GilbertNotificationDelegate()
            print("[NOTIF-SWIFT] Delegate créé")
        }
        // Toujours réassigner — Tauri peut l'écraser
        UNUserNotificationCenter.current().delegate = gilbertNotifDelegate

        // Enregistrer les catégories de notification avec les boutons d'action
        let recordAction = UNNotificationAction(
            identifier: "RECORD_ACTION",
            title: "Enregistrer",
            options: [.foreground]
        )
        let ignoreAction = UNNotificationAction(
            identifier: "IGNORE_ACTION",
            title: "Ignorer",
            options: []
        )
        let meetingCategory = UNNotificationCategory(
            identifier: "MEETING_DETECTED",
            actions: [recordAction, ignoreAction],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([meetingCategory])
        print("[NOTIF-SWIFT] Catégories enregistrées, delegate actif ✅")
    }
}

/// Envoie une notification native macOS avec boutons "Enregistrer" et "Ignorer"
/// Utilise UNUserNotificationCenter → icône de l'app Gilbert, style bannière macOS natif
@_cdecl("send_meeting_notification")
public func send_meeting_notification(appName: UnsafePointer<CChar>) {
    let name = String(cString: appName)
    print("[NOTIF-SWIFT] Envoi notification réunion: \(name)")

    let center = UNUserNotificationCenter.current()

    // Vérifier la permission avant d'envoyer
    center.getNotificationSettings { settings in
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            print("[NOTIF-SWIFT] Permission notifications non accordée: \(settings.authorizationStatus.rawValue)")
            // Demander la permission si pas encore accordée
            center.requestAuthorization(options: [.alert, .sound]) { granted, error in
                if granted {
                    send_meeting_notification(appName: appName)
                }
            }
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Une réunion ? Enregistrez avec Gilbert"
        content.sound = UNNotificationSound.default
        content.categoryIdentifier = "MEETING_DETECTED"

        // ID fixe pour notification générique — remplace la notif précédente
        let notifID = "gilbert-meeting-detected"
        let request = UNNotificationRequest(
            identifier: notifID,
            content: content,
            trigger: nil
        )

        center.add(request) { error in
            if let error = error {
                print("[NOTIF-SWIFT] Erreur envoi notification: \(error)")
            } else {
                print("[NOTIF-SWIFT] Notification envoyée ✅")
            }
        }
    }
}

// MARK: - CoreAudio Microphone Activity Detection

/// Retourne true si le microphone par défaut est actif (utilisé par une app).
/// Correspond à l'indicateur orange dans la barre de menu macOS.
/// Utilise kAudioDevicePropertyDeviceIsRunningSomewhere — ne nécessite pas de permission TCC.
@_cdecl("is_microphone_active")
public func is_microphone_active() -> Bool {
    var defaultInputDevice: AudioDeviceID = kAudioObjectUnknown
    var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address, 0, nil,
        &propertySize, &defaultInputDevice
    )
    guard status == noErr, defaultInputDevice != kAudioObjectUnknown else {
        return false
    }

    var isRunning: UInt32 = 0
    var propSize = UInt32(MemoryLayout<UInt32>.size)
    var runningAddr = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
        mScope: kAudioObjectPropertyScopeInput,
        mElement: kAudioObjectPropertyElementMain
    )
    let status2 = AudioObjectGetPropertyData(
        defaultInputDevice, &runningAddr, 0, nil,
        &propSize, &isRunning
    )
    let active = status2 == noErr && isRunning != 0
    if active {
        print("[AUDIO-SWIFT] Microphone actif (kAudioDevicePropertyDeviceIsRunningSomewhere = 1)")
    }
    return active
}

// MARK: - Dock Reopen Handler

/// Callback appelé depuis Rust quand l'app doit rouvrir sa fenêtre (clic Dock)
public typealias DockReopenCallback = @convention(c) () -> Void
private var dockReopenCallback: DockReopenCallback?

/// AppDelegate wrapper qui chaîne avec le delegate Tauri existant
private class GilbertAppDelegate: NSObject, NSApplicationDelegate {
    weak var originalDelegate: NSApplicationDelegate?

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // Appeler le delegate original de Tauri si présent
        let originalResult = originalDelegate?.applicationShouldHandleReopen?(sender, hasVisibleWindows: flag) ?? true
        if !flag {
            // Pas de fenêtre visible → appeler le callback Rust pour montrer la fenêtre
            dockReopenCallback?()
        }
        return originalResult
    }

    // Forwarder toutes les autres méthodes au delegate original
    override func responds(to aSelector: Selector!) -> Bool {
        return super.responds(to: aSelector) || (originalDelegate?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if originalDelegate?.responds(to: aSelector) == true {
            return originalDelegate
        }
        return super.forwardingTarget(for: aSelector)
    }
}
private var gilbertDelegate: GilbertAppDelegate?

@_cdecl("setup_dock_reopen_handler")
public func setup_dock_reopen_handler(callback: DockReopenCallback?) {
    dockReopenCallback = callback
    DispatchQueue.main.async {
        gilbertDelegate = GilbertAppDelegate()
        // Chaîner avec le delegate Tauri existant
        gilbertDelegate?.originalDelegate = NSApplication.shared.delegate
        NSApplication.shared.delegate = gilbertDelegate
        print("[DOCK] applicationShouldHandleReopen handler installé (avec chaînage Tauri)")
    }
}
