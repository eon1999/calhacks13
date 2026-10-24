#include "fall_detector.h"

#include <algorithm>
#include <cmath>

namespace cadence {

void FallDetector::trackFreeFall(float magnitude, uint32_t nowMs) {
  if (magnitude < kFreeFallG) {
    if (!inFreeFall_) {
      inFreeFall_ = true;
      freeFallStartMs_ = nowMs;
    }
    return;
  }
  if (inFreeFall_ && nowMs - freeFallStartMs_ >= kFreeFallMs) {
    hasDrop_ = true;
    dropEndMs_ = nowMs;
  }
  inFreeFall_ = false;
}

bool FallDetector::droppedRecently(uint32_t nowMs) const {
  return hasDrop_ && nowMs - dropEndMs_ <= kFreeFallWindowMs;
}

bool FallDetector::update(const Accel& a, uint32_t nowMs) {
  const float magnitude = a.magnitude();
  trackFreeFall(magnitude, nowMs);
  if (hasFallen_ && nowMs - lastFallMs_ < kCooldownMs) {
    state_ = State::Idle;
    return false;
  }

  switch (state_) {
    case State::Idle:
      if (magnitude >= kImpactG && droppedRecently(nowMs)) {
        state_ = State::Impact;
        impactMs_ = nowMs;
        peak_ = magnitude;
      }
      return false;

    case State::Impact:
      peak_ = std::max(peak_, magnitude);
      if (nowMs - impactMs_ >= kPeakWindowMs) {
        state_ = State::WaitStill;
        still_ = false;
      }
      return false;

    case State::WaitStill:
      if (std::fabs(magnitude - 1.0f) < kStillToleranceG) {
        if (!still_) {
          still_ = true;
          stillSinceMs_ = nowMs;
        }
        if (nowMs - stillSinceMs_ < kStillMs) return false;
        peakG_ = peak_;
        hasFallen_ = true;
        lastFallMs_ = nowMs;
        state_ = State::Idle;
        return true;
      }
      still_ = false;
      if (magnitude >= kImpactG) {
        // Another hit (a bounce, or a second impact): start the window again.
        state_ = State::Impact;
        impactMs_ = nowMs;
        peak_ = std::max(peak_, magnitude);
      } else if (nowMs - impactMs_ > kStillDeadlineMs) {
        state_ = State::Idle;  // kept moving: a bump, not a fall
      }
      return false;
  }
  return false;
}

}  // namespace cadence
