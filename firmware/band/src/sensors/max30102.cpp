#include "max30102.h"

namespace {
// 200 samples/s averaged 4 at a time = 50 samples/s, matching the motion rate.
constexpr uint8_t kLedBrightness = 0x1F;  // ~6 mA: enough through skin at the wrist
constexpr uint8_t kSampleAverage = 4;
constexpr uint8_t kLedModeRedIr = 2;
constexpr int kSampleRate = 200;
constexpr int kPulseWidth = 411;
constexpr int kAdcRange = 4096;
constexpr uint32_t kSamplePeriodMs = 20;
}  // namespace

bool Max30102::begin() {
  const bool found = sensor_.begin(wire_, I2C_SPEED_FAST);
  // The library calls Wire.begin() on the default pins; put ours back.
  wire_.begin(sdaPin_, sclPin_);
  if (!found) return false;
  sensor_.setup(kLedBrightness, kSampleAverage, kLedModeRedIr, kSampleRate, kPulseWidth, kAdcRange);
  return true;
}

bool Max30102::read(uint32_t nowMs, uint32_t& ir, uint32_t& sampleMs) {
  sensor_.check();
  if (!sensor_.available()) return false;
  // Samples come in bursts from the FIFO, oldest first. Stamp each one back
  // from now by the samples still queued after it, never earlier than the last.
  const uint32_t queuedAfter = sensor_.available() - 1u;
  ir = sensor_.getFIFOIR();
  sensor_.nextSample();
  uint32_t stamp = nowMs - queuedAfter * kSamplePeriodMs;
  if (static_cast<int32_t>(stamp - lastSampleMs_) <= 0) stamp = lastSampleMs_ + 1;
  lastSampleMs_ = stamp;
  sampleMs = stamp;
  return true;
}
