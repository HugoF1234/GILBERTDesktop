#ifndef SCK_BRIDGE_H
#define SCK_BRIDGE_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Callback types
typedef void (*AudioDataCallback)(const float* samples, int32_t frameCount, int32_t sampleRate, int32_t channels);
typedef void (*ErrorCallback)(const char* error);
typedef void (*DockReopenCallback)(void);

// Check if ScreenCaptureKit is available (macOS 12.3+)
bool sck_is_available(void);

// Check if we have screen recording permission
bool sck_has_permission(void);

// Request screen recording permission (will show system dialog)
bool sck_request_permission(void);

// Set callbacks for audio data and errors
void sck_set_callbacks(AudioDataCallback audioCallback, ErrorCallback errorCallback);

// Start capturing system audio to a file
bool sck_start_capture(const char* outputPath);

// Stop capturing
bool sck_stop_capture(void);

// Check if currently recording
bool sck_is_recording(void);

// Setup Dock reopen handler (applicationShouldHandleReopen)
void setup_dock_reopen_handler(DockReopenCallback callback);

#ifdef __cplusplus
}
#endif

#endif // SCK_BRIDGE_H
