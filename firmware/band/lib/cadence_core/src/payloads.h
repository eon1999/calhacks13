#pragma once

// JSON bodies for the device API (convex/http.ts, README "Device API").
// Each writer returns the length written, or -1 if `size` was too small.

#include <cstddef>

#include "activity_window.h"

namespace cadence {

enum class Led { Off, Due, Taken, Missed };

/** What POST /device/heartbeat tells the band to do. */
struct Commands {
  Led led;
  bool buzz;
};

int activityJson(char* out, size_t size, const char* deviceId, const ActivitySummary& s);
int fallJson(char* out, size_t size, const char* deviceId, float peakG);
int sosJson(char* out, size_t size, const char* deviceId);
int heartbeatJson(char* out, size_t size, const char* deviceId, const char* firmwareVersion);

/** Reads `{ "led": ..., "buzz": ... }`. Returns false if either is missing or unknown. */
bool parseCommands(const char* body, Commands& out);

/** Device ids the server accepts: 2-64 of A-Z a-z 0-9 - _ (so no JSON escaping). */
bool validDeviceId(const char* deviceId);

}  // namespace cadence
