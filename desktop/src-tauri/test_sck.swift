#!/usr/bin/env swift

import Foundation
import AVFoundation
import ScreenCaptureKit

// Test ScreenCaptureKit audio capture
print("=== ScreenCaptureKit Audio Test ===")
print("macOS version check...")

if #available(macOS 13.0, *) {
    print("✅ macOS 13.0+ available")
} else {
    print("❌ Requires macOS 13.0+")
    exit(1)
}

// Check permission
print("\nChecking Screen Recording permission...")
let semaphore = DispatchSemaphore(value: 0)
var hasPermission = false
var displays: [SCDisplay] = []

if #available(macOS 13.0, *) {
    SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
        if let error = error {
            print("❌ Permission error: \(error.localizedDescription)")
            hasPermission = false
        } else if let content = content {
            displays = content.displays
            hasPermission = !displays.isEmpty
            print("✅ Permission granted - found \(displays.count) display(s)")
        }
        semaphore.signal()
    }

    _ = semaphore.wait(timeout: .now() + 5.0)
}

if !hasPermission {
    print("❌ No permission or no displays")
    exit(1)
}

// Test audio capture
print("\n=== Starting 5-second audio capture test ===")
print("Play some audio on your computer now!")

if #available(macOS 13.0, *) {
    let outputPath = "/tmp/sck_test_audio.wav"

    Task {
        do {
            guard let display = displays.first else {
                print("❌ No display")
                exit(1)
            }

            let filter = SCContentFilter(display: display, excludingWindows: [])

            let config = SCStreamConfiguration()
            config.width = 2
            config.height = 2
            config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
            config.capturesAudio = true
            config.sampleRate = 48000
            config.channelCount = 2
            config.excludesCurrentProcessAudio = true

            print("Creating stream...")
            let stream = SCStream(filter: filter, configuration: config, delegate: nil)

            // Simple audio handler
            class AudioHandler: NSObject, SCStreamOutput {
                var sampleCount = 0
                var audioFile: AVAudioFile?

                init(outputPath: String) {
                    super.init()
                    let url = URL(fileURLWithPath: outputPath)
                    let settings: [String: Any] = [
                        AVFormatIDKey: kAudioFormatLinearPCM,
                        AVSampleRateKey: 48000,
                        AVNumberOfChannelsKey: 2,
                        AVLinearPCMBitDepthKey: 16,
                        AVLinearPCMIsFloatKey: false
                    ]
                    do {
                        audioFile = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: true)
                        print("✅ Audio file created: \(outputPath)")
                    } catch {
                        print("❌ Failed to create audio file: \(error)")
                    }
                }

                func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
                    guard type == .audio else { return }
                    sampleCount += 1

                    if sampleCount % 50 == 0 {
                        print("  Audio samples received: \(sampleCount)")
                    }

                    // Write to file
                    guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }
                    let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)

                    guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
                          let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc) else { return }

                    guard let format = AVAudioFormat(
                        commonFormat: .pcmFormatFloat32,
                        sampleRate: asbd.pointee.mSampleRate,
                        channels: AVAudioChannelCount(asbd.pointee.mChannelsPerFrame),
                        interleaved: true
                    ) else { return }

                    guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount)) else { return }
                    pcmBuffer.frameLength = AVAudioFrameCount(frameCount)

                    var length = 0
                    var dataPointer: UnsafeMutablePointer<Int8>?
                    CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)

                    if let data = dataPointer, let floatData = pcmBuffer.floatChannelData {
                        memcpy(floatData[0], data, length)
                    }

                    do {
                        try audioFile?.write(from: pcmBuffer)
                    } catch {
                        // Ignore write errors
                    }
                }

                func close() {
                    audioFile = nil
                }
            }

            let handler = AudioHandler(outputPath: outputPath)
            try stream.addStreamOutput(handler, type: .audio, sampleHandlerQueue: .global())

            print("Starting capture...")
            try await stream.startCapture()
            print("✅ Capture started! Recording for 5 seconds...")

            try await Task.sleep(nanoseconds: 5_000_000_000)

            print("Stopping capture...")
            try await stream.stopCapture()
            handler.close()

            print("\n=== Results ===")
            print("Total audio samples received: \(handler.sampleCount)")

            // Check file
            let fileManager = FileManager.default
            if fileManager.fileExists(atPath: outputPath) {
                let attrs = try fileManager.attributesOfItem(atPath: outputPath)
                let size = attrs[.size] as? Int64 ?? 0
                print("Output file size: \(size) bytes")

                if size > 1000 {
                    print("✅ SUCCESS: Audio was captured!")
                    print("File saved to: \(outputPath)")
                    print("\nYou can play it with: afplay \(outputPath)")
                } else {
                    print("⚠️ WARNING: File is very small, audio may not have been captured")
                }
            } else {
                print("❌ Output file not created")
            }

            exit(0)
        } catch {
            print("❌ Capture error: \(error.localizedDescription)")
            exit(1)
        }
    }

    RunLoop.main.run()
}
