#pragma once

// Made-up sensors for a bare ESP32 (the band-sim build). SimControl is changed
// from the serial monitor; see handleSimInput in main.cpp.

#include "sensors.h"
#include "synthetic.h"

struct SimControl {
  bool walking = false;
  bool offWrist = false;
  bool hasFall = false;
  uint32_t fallStartMs = 0;
};

class SimMotion : public MotionSensor {
 public:
  explicit SimMotion(const SimControl& control) : control_(control) {}
  bool begin() override { return true; }
  bool read(uint32_t nowMs, cadence::Accel& out) override;

 private:
  const SimControl& control_;
  cadence::MotionSignal still_{0.0f, 0.0f, 7};
  cadence::MotionSignal walk_{1.9f, 0.35f, 11};
};

class SimPulse : public PulseSensor {
 public:
  explicit SimPulse(const SimControl& control) : control_(control) {}
  bool begin() override { return true; }
  bool read(uint32_t nowMs, uint32_t& ir, uint32_t& sampleMs) override;

 private:
  const SimControl& control_;
  cadence::PulseSignal pulse_{72.0f, 13};
  uint32_t lastMs_ = 0;
};
