#include "payloads.h"

#include <cstdio>
#include <cstring>

namespace cadence {

namespace {

int finish(int written, size_t size) {
  return written >= 0 && static_cast<size_t>(written) < size ? written : -1;
}

/** Points just past `"key"` and the colon after it, or nullptr. */
const char* valueOf(const char* body, const char* key) {
  char quoted[24];
  if (std::snprintf(quoted, sizeof quoted, "\"%s\"", key) >= static_cast<int>(sizeof quoted)) return nullptr;
  const char* at = std::strstr(body, quoted);
  if (!at) return nullptr;
  at += std::strlen(quoted);
  while (*at == ' ' || *at == '\t' || *at == '\n' || *at == '\r') ++at;
  if (*at != ':') return nullptr;
  ++at;
  while (*at == ' ' || *at == '\t' || *at == '\n' || *at == '\r') ++at;
  return at;
}

bool startsWith(const char* text, const char* prefix) {
  return std::strncmp(text, prefix, std::strlen(prefix)) == 0;
}

}  // namespace

int activityJson(char* out, size_t size, const char* deviceId, const ActivitySummary& s) {
  const auto steps = static_cast<unsigned long>(s.steps);
  const auto active = static_cast<unsigned long>(s.activeMinutes);
  if (s.heartRate == 0) {
    return finish(std::snprintf(out, size, R"({"deviceId":"%s","steps":%lu,"activeMinutes":%lu})", deviceId, steps, active), size);
  }
  return finish(std::snprintf(out, size, R"({"deviceId":"%s","steps":%lu,"activeMinutes":%lu,"heartRate":%u})", deviceId,
                              steps, active, static_cast<unsigned>(s.heartRate)),
                size);
}

int fallJson(char* out, size_t size, const char* deviceId, float peakG) {
  return finish(std::snprintf(out, size, R"({"deviceId":"%s","type":"fall","peakG":%.1f})", deviceId, static_cast<double>(peakG)), size);
}

int sosJson(char* out, size_t size, const char* deviceId) {
  return finish(std::snprintf(out, size, R"({"deviceId":"%s","type":"sos"})", deviceId), size);
}

int heartbeatJson(char* out, size_t size, const char* deviceId, const char* firmwareVersion) {
  return finish(std::snprintf(out, size, R"({"deviceId":"%s","firmwareVersion":"%s"})", deviceId, firmwareVersion), size);
}

bool parseCommands(const char* body, Commands& out) {
  if (!body) return false;
  const char* led = valueOf(body, "led");
  const char* buzz = valueOf(body, "buzz");
  if (!led || !buzz) return false;

  Commands parsed{};
  if (startsWith(led, "\"off\"")) {
    parsed.led = Led::Off;
  } else if (startsWith(led, "\"due\"")) {
    parsed.led = Led::Due;
  } else if (startsWith(led, "\"taken\"")) {
    parsed.led = Led::Taken;
  } else if (startsWith(led, "\"missed\"")) {
    parsed.led = Led::Missed;
  } else {
    return false;
  }
  if (startsWith(buzz, "true")) {
    parsed.buzz = true;
  } else if (startsWith(buzz, "false")) {
    parsed.buzz = false;
  } else {
    return false;
  }
  out = parsed;
  return true;
}

bool validDeviceId(const char* deviceId) {
  if (!deviceId) return false;
  const size_t length = std::strlen(deviceId);
  if (length < 2 || length > 64) return false;
  for (size_t i = 0; i < length; ++i) {
    const char c = deviceId[i];
    const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_';
    if (!ok) return false;
  }
  return true;
}

}  // namespace cadence
