#pragma once

#include <Wire.h>

#include "sensors.h"

/** MPU6050 (or MPU6500/9250 in 6050 mode) over I2C, set to ±8 g so falls don't clip. */
class Mpu6050 : public MotionSensor {
 public:
  explicit Mpu6050(TwoWire& wire, uint8_t address = 0x68) : wire_(wire), address_(address) {}
  bool begin() override;
  bool read(uint32_t nowMs, cadence::Accel& out) override;

 private:
  bool writeRegister(uint8_t reg, uint8_t value);

  TwoWire& wire_;
  uint8_t address_;
};
