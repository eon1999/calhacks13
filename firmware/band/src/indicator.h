#pragma once

#include <cstdint>

#include "payloads.h"

/**
 * The LED and buzz motor. Shows what the last heartbeat said:
 *   due     slow blink        missed  fast blink
 *   taken   steady on         off     off
 * and buzzes in short pulses while the server asks for it.
 */
class Indicator {
 public:
  Indicator(int ledPin, int buzzPin) : ledPin_(ledPin), buzzPin_(buzzPin) {}
  void begin();
  void show(const cadence::Commands& commands) { commands_ = commands; }
  /** One short buzz, to confirm a button press or a detected fall. */
  void chirp(uint32_t nowMs) {
    chirping_ = true;
    chirpUntilMs_ = nowMs + kChirpMs;
  }
  /** Call often (every sample). */
  void update(uint32_t nowMs);

 private:
  static constexpr uint32_t kChirpMs = 300;

  int ledPin_;
  int buzzPin_;
  cadence::Commands commands_{cadence::Led::Off, false};
  bool chirping_ = false;
  uint32_t chirpUntilMs_ = 0;
};
