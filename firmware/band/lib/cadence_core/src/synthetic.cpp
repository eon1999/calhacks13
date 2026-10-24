#include "synthetic.h"

#include <cmath>

namespace cadence {

namespace {
constexpr float kTwoPi = 6.2831853f;
constexpr float kRestNoiseG = 0.01f;
constexpr float kWalkNoiseG = 0.02f;
constexpr float kPpgLevel = 100000.0f;  // IR counts on skin (MAX30102, 18-bit)
constexpr float kPpgDepth = 1200.0f;    // how far IR dips on each beat
constexpr float kPpgWander = 300.0f;    // slow drift from breathing and strap pressure
constexpr float kPpgNoise = 40.0f;

float gaussian(float x, float centre, float width) {
  const float d = (x - centre) / width;
  return std::exp(-d * d);
}
}  // namespace

float Noise::next() {
  state_ = state_ * 1664525u + 1013904223u;
  return static_cast<float>(state_ >> 8) / 8388608.0f - 1.0f;
}

Accel MotionSignal::at(uint32_t tMs) {
  const float t = static_cast<float>(tMs) / 1000.0f;
  if (cadenceHz_ <= 0.0f) {
    return {kRestNoiseG * noise_.next(), kRestNoiseG * noise_.next(), 1.0f + kRestNoiseG * noise_.next()};
  }
  // Each step jolts the wrist up and down once; the arm swings at half that rate.
  const float bounce = amplitudeG_ * std::sin(kTwoPi * cadenceHz_ * t);
  const float swing = 0.5f * amplitudeG_ * std::sin(kTwoPi * 0.5f * cadenceHz_ * t);
  return {swing + kWalkNoiseG * noise_.next(), kWalkNoiseG * noise_.next(), 1.0f + bounce + kWalkNoiseG * noise_.next()};
}

Accel fallAt(uint32_t tMs, float impactG) {
  if (tMs < 300) return {0.0f, 0.0f, 0.3f};      // falling: close to weightless
  if (tMs < 360) return {0.0f, 0.0f, impactG};   // hitting the floor
  if (tMs < 500) return {0.5f, 0.0f, 1.6f};      // bounce and settle
  return {1.0f, 0.02f, 0.05f};                   // lying on one side
}

uint32_t PulseSignal::at(uint32_t tMs) {
  if (started_) phase_ += static_cast<float>(tMs - lastMs_) * bpm_ / 60000.0f;
  started_ = true;
  lastMs_ = tMs;
  phase_ -= std::floor(phase_);
  // Blood arriving absorbs IR: a sharp dip, then a smaller one (the dicrotic notch).
  const float pulse = gaussian(phase_, 0.15f, 0.07f) + 0.35f * gaussian(phase_, 0.45f, 0.1f);
  const float wander = kPpgWander * std::sin(kTwoPi * static_cast<float>(tMs) / 8000.0f);
  return static_cast<uint32_t>(kPpgLevel - kPpgDepth * pulse + wander + kPpgNoise * noise_.next());
}

}  // namespace cadence
