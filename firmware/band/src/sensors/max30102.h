#pragma once

#include <MAX30105.h>
#include <Wire.h>

#include "sensors.h"

/** MAX30102 pulse sensor (SparkFun MAX3010x library), IR channel at 50 samples/s. */
class Max30102 : public PulseSensor {
 public:
  Max30102(TwoWire& wire, int sdaPin, int sclPin) : wire_(wire), sdaPin_(sdaPin), sclPin_(sclPin) {}
  bool begin() override;
  bool read(uint32_t nowMs, uint32_t& ir, uint32_t& sampleMs) override;

 private:
  TwoWire& wire_;
  int sdaPin_;
  int sclPin_;
  MAX30105 sensor_;
  uint32_t lastSampleMs_ = 0;
};
