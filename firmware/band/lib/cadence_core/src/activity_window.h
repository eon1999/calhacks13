#pragma once

#include <cstdint>

namespace cadence {

/** What one POST /device/activity carries. heartRate 0 means "leave it out". */
struct ActivitySummary {
  uint32_t steps;
  uint32_t activeMinutes;
  uint8_t heartRate;
};

/**
 * Collects one activity window. The server adds windows up per day, so counts
 * are since the last successful post, not since boot.
 *
 * Post `snapshot()`, then `commit()` what was sent only if the server took it.
 * Steps that arrive while the request is in flight stay for the next window,
 * and a failed post just makes the next window bigger.
 */
class ActivityWindow {
 public:
  /** A minute with at least this many steps counts as an active minute. */
  static constexpr uint32_t kActiveStepsPerMinute = 40;
  static constexpr uint32_t kMinuteMs = 60000;

  /** Call often with StepCounter::total(). */
  void tick(uint32_t totalSteps, uint32_t nowMs);

  /** Call with each non-zero BPM reading. */
  void addHeartRate(uint8_t bpm);

  ActivitySummary snapshot() const;
  void commit(const ActivitySummary& sent);

 private:
  bool started_ = false;
  uint32_t totalSteps_ = 0;
  uint32_t windowStartSteps_ = 0;
  uint32_t minuteStartMs_ = 0;
  uint32_t minuteStartSteps_ = 0;
  uint32_t activeMinutes_ = 0;
  uint32_t heartSum_ = 0;
  uint32_t heartCount_ = 0;
};

}  // namespace cadence
