#include "beat_detector.h"

#include <algorithm>
#include <cmath>

#include "filters.h"

namespace cadence {

namespace {
constexpr float kDcTauMs = 400.0f;  // high-pass: drops breathing and strap drift
constexpr float kSmoothTauMs = 20.0f;
constexpr float kTroughTauMs = 3000.0f;
// A beat must dip at least this far (IR counts), or it's sensor noise.
constexpr float kMinDepth = 20.0f;
// In a beat below kArmFraction of the recent dip depth; the beat counts once
// the signal recovers past kRiseFraction.
constexpr float kArmFraction = 0.5f;
constexpr float kRiseFraction = 0.25f;
}  // namespace

void BeatDetector::reset() {
  started_ = false;
  ac_ = 0.0f;
  trough_ = 0.0f;
  below_ = false;
  hasBeat_ = false;
  count_ = 0;
  next_ = 0;
  rejects_ = 0;
}

void BeatDetector::update(uint32_t ir, uint32_t nowMs) {
  contact_ = ir >= noContactBelow_;
  if (!contact_) {
    reset();
    return;
  }
  const auto value = static_cast<float>(ir);
  if (!started_) {
    started_ = true;
    dc_ = value;
    lastMs_ = nowMs;
    return;
  }
  const auto elapsed = static_cast<int32_t>(nowMs - lastMs_);
  if (elapsed <= 0) return;
  const auto dt = static_cast<uint32_t>(elapsed);
  lastMs_ = nowMs;
  dc_ += emaWeight(dt, kDcTauMs) * (value - dc_);
  ac_ += emaWeight(dt, kSmoothTauMs) * ((value - dc_) - ac_);
  // The trough follows dips down at once and relaxes back slowly.
  trough_ = std::min(ac_, trough_ * (1.0f - emaWeight(dt, kTroughTauMs)));

  if (trough_ < -kMinDepth && ac_ < kArmFraction * trough_) {
    below_ = true;
  } else if (below_ && ac_ > kRiseFraction * trough_) {
    below_ = false;
    onBeat(nowMs);
  }
}

void BeatDetector::onBeat(uint32_t nowMs) {
  if (!hasBeat_) {
    hasBeat_ = true;
    lastBeatMs_ = nowMs;
    return;
  }
  const uint32_t interval = nowMs - lastBeatMs_;
  if (interval < kMinIntervalMs) return;  // part of the same beat
  lastBeatMs_ = nowMs;
  if (interval > kMaxIntervalMs) return;  // missed beats; start timing again

  if (count_ >= 2) {
    const float avg = average();
    if (std::fabs(static_cast<float>(interval) - avg) > kMaxDeviation * avg) {
      if (++rejects_ < kRejectsBeforeReset) return;
      // Several in a row disagree: the rate really changed.
      count_ = 0;
      next_ = 0;
    }
  }
  rejects_ = 0;
  intervals_[next_] = interval;
  next_ = (next_ + 1) % kIntervals;
  count_ = std::min(count_ + 1, kIntervals);
}

float BeatDetector::average() const {
  uint32_t sum = 0;
  for (int i = 0; i < count_; ++i) sum += intervals_[i];
  return static_cast<float>(sum) / static_cast<float>(count_);
}

uint8_t BeatDetector::bpm(uint32_t nowMs) const {
  // Signed: a beat stamped a little after `nowMs` is fresh, not 49 days old.
  const auto sinceBeat = static_cast<int32_t>(nowMs - lastBeatMs_);
  if (!contact_ || count_ < kIntervals || sinceBeat > static_cast<int32_t>(kStaleMs)) return 0;
  const float bpm = 60000.0f / average();
  return static_cast<uint8_t>(std::min(255.0f, std::round(bpm)));
}

}  // namespace cadence
