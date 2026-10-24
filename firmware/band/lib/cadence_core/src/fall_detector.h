#pragma once

#include "sample.h"

namespace cadence {

/**
 * Flags a fall: a drop, a hard impact, then lying still.
 *
 * The drop is free fall (|a| < kFreeFallG for kFreeFallMs) ending at most
 * kFreeFallWindowMs before the impact, so a knock on a table isn't a fall.
 * Impact is |a| >= kImpactG. The peak is tracked for kPeakWindowMs, then the
 * wearer must stay still (|a| within kStillToleranceG of 1 g) for kStillMs,
 * starting no later than kStillDeadlineMs after impact. Moving on, as after a
 * clap or a bumped table, cancels it. One fall per kCooldownMs.
 */
class FallDetector {
 public:
  static constexpr float kFreeFallG = 0.5f;
  static constexpr uint32_t kFreeFallMs = 60;
  static constexpr uint32_t kFreeFallWindowMs = 1000;
  static constexpr float kImpactG = 2.5f;
  static constexpr uint32_t kPeakWindowMs = 200;
  static constexpr float kStillToleranceG = 0.25f;
  static constexpr uint32_t kStillMs = 1500;
  static constexpr uint32_t kStillDeadlineMs = 2500;
  static constexpr uint32_t kCooldownMs = 10000;

  /** Returns true once, on the sample that confirms a fall. */
  bool update(const Accel& a, uint32_t nowMs);

  /** Peak |a| of the last confirmed fall, in g. */
  float peakG() const { return peakG_; }

 private:
  enum class State { Idle, Impact, WaitStill };

  void trackFreeFall(float magnitude, uint32_t nowMs);
  bool droppedRecently(uint32_t nowMs) const;

  bool inFreeFall_ = false;
  uint32_t freeFallStartMs_ = 0;
  bool hasDrop_ = false;
  uint32_t dropEndMs_ = 0;

  State state_ = State::Idle;
  uint32_t impactMs_ = 0;
  uint32_t stillSinceMs_ = 0;
  bool still_ = false;
  float peak_ = 0.0f;
  float peakG_ = 0.0f;
  bool hasFallen_ = false;
  uint32_t lastFallMs_ = 0;
};

}  // namespace cadence
