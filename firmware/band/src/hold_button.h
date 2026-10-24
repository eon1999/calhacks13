#pragma once

#include <Arduino.h>

/** A button (to ground, internal pull-up) that fires once when held for holdMs. */
class HoldButton {
 public:
  HoldButton(int pin, uint32_t holdMs) : pin_(pin), holdMs_(holdMs) {}

  void begin() { pinMode(pin_, INPUT_PULLUP); }

  /** True once per press, on the sample where it has been held long enough. */
  bool update(uint32_t nowMs) {
    const bool pressed = digitalRead(pin_) == LOW;
    if (pressed && !wasPressed_) {
      pressedAtMs_ = nowMs;
      fired_ = false;
    }
    wasPressed_ = pressed;
    if (!pressed || fired_ || nowMs - pressedAtMs_ < holdMs_) return false;
    fired_ = true;
    return true;
  }

 private:
  int pin_;
  uint32_t holdMs_;
  bool wasPressed_ = false;
  bool fired_ = false;
  uint32_t pressedAtMs_ = 0;
};
