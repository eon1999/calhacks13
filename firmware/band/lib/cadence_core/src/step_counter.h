#pragma once

#include "sample.h"

namespace cadence {

/**
 * Counts steps from a wrist accelerometer sampled at ~50 Hz.
 *
 * Gravity is removed with a slow average of |a|, the rest is smoothed, and a
 * step is a rise through `kRiseG` after dipping below `kResetG`. A step only
 * counts once it is part of a run of `kRunToCount` steps with no gap longer
 * than `kMaxGapMs`, so waving or a single bump doesn't count as walking.
 */
class StepCounter {
 public:
  static constexpr float kRiseG = 0.10f;
  static constexpr float kResetG = 0.03f;
  static constexpr uint32_t kMinIntervalMs = 280;  // ~3.5 steps/s at most
  static constexpr uint32_t kMaxGapMs = 2000;
  static constexpr uint32_t kRunToCount = 4;

  void update(const Accel& a, uint32_t nowMs);

  /** Steps since boot. Only ever increases. */
  uint32_t total() const { return total_; }

 private:
  bool started_ = false;
  uint32_t lastMs_ = 0;
  float gravity_ = 1.0f;
  float smooth_ = 0.0f;
  bool armed_ = false;
  uint32_t lastStepMs_ = 0;
  uint32_t run_ = 0;
  uint32_t total_ = 0;
};

}  // namespace cadence
