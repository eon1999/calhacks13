#pragma once

// Band settings. Override the CADENCE_* ones with -D in platformio.ini.

#include <cstdint>

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.1.0"
#endif

#ifndef CADENCE_WINDOW_MS
#define CADENCE_WINDOW_MS 300000  // one activity window every 5 minutes
#endif

#ifndef CADENCE_HEARTBEAT_MS
#define CADENCE_HEARTBEAT_MS 30000
#endif

namespace config {

// Pins (ESP32 DevKit). GPIO 0 is the BOOT button and GPIO 2 the blue LED on
// most dev boards, so a bare board can already show reminders and send SOS.
constexpr int kPinSda = 21;
constexpr int kPinScl = 22;
constexpr int kPinLed = 2;
constexpr int kPinBuzz = 25;  // vibration motor (through a transistor) or active buzzer
constexpr int kPinSosButton = 0;

constexpr uint32_t kSampleMs = 20;  // motion and pulse at 50 Hz
constexpr uint32_t kWindowMs = CADENCE_WINDOW_MS;
constexpr uint32_t kHeartbeatMs = CADENCE_HEARTBEAT_MS;
constexpr uint32_t kEventRetryMs = 5000;
constexpr uint32_t kWifiRetryMs = 10000;
constexpr uint32_t kHttpTimeoutMs = 5000;
constexpr uint32_t kSosHoldMs = 2000;
constexpr uint32_t kHeartRateEveryMs = 1000;  // one BPM reading per second into the window average

// IR level below which the pulse sensor counts as off the wrist. 50000 is the
// fingertip value; log real readings on a wrist (strap snug) and set this lower.
constexpr uint32_t kNoContactIr = 50000;

// Go dark and quiet if the server hasn't answered a heartbeat for this long,
// so a reminder doesn't buzz forever after Wi-Fi drops.
constexpr uint32_t kCommandsExpireMs = 3 * kHeartbeatMs;

}  // namespace config
