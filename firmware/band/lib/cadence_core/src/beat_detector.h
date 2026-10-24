#pragma once

#include <array>
#include <cstdint>

namespace cadence {

/**
 * Heart rate from a raw PPG stream (the MAX30102's IR channel, ~25-100 Hz).
 *
 * The sensor gives light levels, not BPM. A high-pass leaves the pulse wave,
 * which dips on each beat; a beat is a dip deep enough (relative to recent
 * dips) followed by recovery. BPM is the average of the last kIntervals beat-to-beat
 * gaps. Gaps far off the average are dropped as motion noise.
 */
class BeatDetector {
 public:
  // IR level below which nothing is on the sensor. 50000 suits a fingertip;
  // wrist readings run lower, so measure and pass your own.
  static constexpr uint32_t kDefaultNoContactBelow = 50000;
  static constexpr uint32_t kMinIntervalMs = 300;     // 200 bpm
  static constexpr uint32_t kMaxIntervalMs = 2000;    // 30 bpm
  static constexpr uint32_t kStaleMs = 3000;
  static constexpr int kIntervals = 4;
  static constexpr float kMaxDeviation = 0.3f;
  static constexpr int kRejectsBeforeReset = 3;

  explicit BeatDetector(uint32_t noContactBelow = kDefaultNoContactBelow) : noContactBelow_(noContactBelow) {}

  /** Samples must arrive in time order; one stamped before the last is skipped. */
  void update(uint32_t ir, uint32_t nowMs);

  bool hasContact() const { return contact_; }

  /** Beats per minute, or 0 when there is no trustworthy reading. */
  uint8_t bpm(uint32_t nowMs) const;

 private:
  void reset();
  void onBeat(uint32_t nowMs);
  float average() const;

  uint32_t noContactBelow_;
  bool contact_ = false;
  bool started_ = false;
  float dc_ = 0.0f;
  float ac_ = 0.0f;
  float trough_ = 0.0f;  // recent pulse depth (negative), decays toward 0
  uint32_t lastMs_ = 0;
  bool below_ = false;
  uint32_t lastBeatMs_ = 0;
  bool hasBeat_ = false;
  std::array<uint32_t, kIntervals> intervals_{};
  int count_ = 0;
  int next_ = 0;
  int rejects_ = 0;
};

}  // namespace cadence
