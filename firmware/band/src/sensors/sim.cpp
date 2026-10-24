#include "sim.h"

namespace {
constexpr uint32_t kFallLastsMs = 4000;  // long enough for the detector to see the stillness
constexpr float kFallImpactG = 3.4f;
constexpr float kRestingBpm = 72.0f;
constexpr float kWalkingBpm = 104.0f;
constexpr uint32_t kOffWristIr = 1000;
constexpr uint32_t kSamplePeriodMs = 20;
}  // namespace

bool SimMotion::read(uint32_t nowMs, cadence::Accel& out) {
  if (control_.hasFall && nowMs - control_.fallStartMs < kFallLastsMs) {
    out = cadence::fallAt(nowMs - control_.fallStartMs, kFallImpactG);
  } else {
    out = control_.walking ? walk_.at(nowMs) : still_.at(nowMs);
  }
  return true;
}

bool SimPulse::read(uint32_t nowMs, uint32_t& ir, uint32_t& sampleMs) {
  if (nowMs - lastMs_ < kSamplePeriodMs) return false;
  lastMs_ = nowMs;
  sampleMs = nowMs;
  pulse_.setBpm(control_.walking ? kWalkingBpm : kRestingBpm);
  ir = control_.offWrist ? kOffWristIr : pulse_.at(nowMs);
  return true;
}
