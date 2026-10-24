#pragma once

// What the main loop needs from the band's sensors. Real parts (mpu6050,
// max30102) and made-up ones (sim) both fit, so the rest of the firmware
// doesn't know which it has.

#include <cstdint>

#include "sample.h"

class MotionSensor {
 public:
  virtual ~MotionSensor() = default;
  virtual bool begin() = 0;
  /** Latest accelerometer reading in g. False if the read failed. */
  virtual bool read(uint32_t nowMs, cadence::Accel& out) = 0;
};

class PulseSensor {
 public:
  virtual ~PulseSensor() = default;
  virtual bool begin() = 0;
  /** Next raw IR sample and when it was taken, if one is waiting. Call until false. */
  virtual bool read(uint32_t nowMs, uint32_t& ir, uint32_t& sampleMs) = 0;
};
