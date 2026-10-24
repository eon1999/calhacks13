#pragma once

// Made-up sensor signals: the "sim" firmware build uses them in place of real
// sensors, and the native tests feed them through the detectors.

#include <cstdint>

#include "sample.h"

namespace cadence {

/** Small deterministic noise source (an LCG), so runs are repeatable. */
class Noise {
 public:
  explicit Noise(uint32_t seed = 1) : state_(seed) {}
  /** Uniform in [-1, 1). */
  float next();

 private:
  uint32_t state_;
};

/** Wrist accelerometer: still (cadenceHz 0) or walking at cadenceHz steps/s. */
class MotionSignal {
 public:
  MotionSignal(float cadenceHz, float amplitudeG, uint32_t seed = 1)
      : cadenceHz_(cadenceHz), amplitudeG_(amplitudeG), noise_(seed) {}
  Accel at(uint32_t tMs);

 private:
  float cadenceHz_;
  float amplitudeG_;
  Noise noise_;
};

/**
 * A fall, `tMs` after it starts: ~300 ms of free fall, a short impact spike at
 * `impactG`, then lying still on the side.
 */
Accel fallAt(uint32_t tMs, float impactG);

/** Raw IR from a PPG sensor on skin with a pulse at `bpm`. */
class PulseSignal {
 public:
  explicit PulseSignal(float bpm, uint32_t seed = 1) : bpm_(bpm), noise_(seed) {}
  void setBpm(float bpm) { bpm_ = bpm; }
  uint32_t at(uint32_t tMs);

 private:
  float bpm_;
  float phase_ = 0.0f;
  uint32_t lastMs_ = 0;
  bool started_ = false;
  Noise noise_;
};

}  // namespace cadence
