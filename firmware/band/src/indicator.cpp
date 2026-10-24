#include "indicator.h"

#include <Arduino.h>

namespace {
constexpr uint32_t kSlowBlinkMs = 500;
constexpr uint32_t kFastBlinkMs = 150;
constexpr uint32_t kBuzzPeriodMs = 1000;
constexpr uint32_t kBuzzOnMs = 200;

bool ledOn(cadence::Led led, uint32_t nowMs) {
  switch (led) {
    case cadence::Led::Due:
      return (nowMs / kSlowBlinkMs) % 2 == 0;
    case cadence::Led::Missed:
      return (nowMs / kFastBlinkMs) % 2 == 0;
    case cadence::Led::Taken:
      return true;
    case cadence::Led::Off:
      return false;
  }
  return false;
}
}  // namespace

void Indicator::begin() {
  pinMode(ledPin_, OUTPUT);
  pinMode(buzzPin_, OUTPUT);
  digitalWrite(ledPin_, LOW);
  digitalWrite(buzzPin_, LOW);
}

void Indicator::update(uint32_t nowMs) {
  digitalWrite(ledPin_, ledOn(commands_.led, nowMs) ? HIGH : LOW);
  if (chirping_ && static_cast<int32_t>(nowMs - chirpUntilMs_) >= 0) chirping_ = false;
  const bool pulsing = commands_.buzz && nowMs % kBuzzPeriodMs < kBuzzOnMs;
  digitalWrite(buzzPin_, chirping_ || pulsing ? HIGH : LOW);
}
