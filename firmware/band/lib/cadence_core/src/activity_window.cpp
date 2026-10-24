#include "activity_window.h"

#include <algorithm>

namespace cadence {

void ActivityWindow::tick(uint32_t totalSteps, uint32_t nowMs) {
  if (!started_) {
    started_ = true;
    totalSteps_ = windowStartSteps_ = minuteStartSteps_ = totalSteps;
    minuteStartMs_ = nowMs;
    return;
  }
  totalSteps_ = totalSteps;
  while (nowMs - minuteStartMs_ >= kMinuteMs) {
    // Steps since the last minute boundary all go to the minute that just ended.
    if (totalSteps - minuteStartSteps_ >= kActiveStepsPerMinute) ++activeMinutes_;
    minuteStartSteps_ = totalSteps;
    minuteStartMs_ += kMinuteMs;
  }
}

void ActivityWindow::addHeartRate(uint8_t bpm) {
  if (bpm == 0) return;
  heartSum_ += bpm;
  ++heartCount_;
}

ActivitySummary ActivityWindow::snapshot() const {
  const uint8_t heartRate =
      heartCount_ == 0 ? 0 : static_cast<uint8_t>((heartSum_ + heartCount_ / 2) / heartCount_);
  return {totalSteps_ - windowStartSteps_, activeMinutes_, heartRate};
}

void ActivityWindow::commit(const ActivitySummary& sent) {
  windowStartSteps_ += sent.steps;
  activeMinutes_ -= std::min(sent.activeMinutes, activeMinutes_);
  heartSum_ = 0;
  heartCount_ = 0;
}

}  // namespace cadence
