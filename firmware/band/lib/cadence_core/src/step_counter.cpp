#include "step_counter.h"

#include "filters.h"

namespace cadence {

namespace {
constexpr float kGravityTauMs = 2000.0f;
constexpr float kSmoothTauMs = 40.0f;
}  // namespace

void StepCounter::update(const Accel& a, uint32_t nowMs) {
  const float magnitude = a.magnitude();
  if (!started_) {
    started_ = true;
    gravity_ = magnitude;
    lastMs_ = nowMs;
    return;
  }
  const uint32_t dt = nowMs - lastMs_;
  lastMs_ = nowMs;
  gravity_ += emaWeight(dt, kGravityTauMs) * (magnitude - gravity_);
  smooth_ += emaWeight(dt, kSmoothTauMs) * ((magnitude - gravity_) - smooth_);

  if (smooth_ < kResetG) {
    armed_ = true;
    return;
  }
  if (!armed_ || smooth_ < kRiseG) return;
  armed_ = false;

  if (run_ > 0 && nowMs - lastStepMs_ < kMinIntervalMs) return;
  if (run_ > 0 && nowMs - lastStepMs_ > kMaxGapMs) run_ = 0;
  lastStepMs_ = nowMs;
  ++run_;
  if (run_ == kRunToCount) {
    total_ += kRunToCount;
  } else if (run_ > kRunToCount) {
    ++total_;
  }
}

}  // namespace cadence
