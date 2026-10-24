#pragma once

// Portable band logic: no Arduino headers anywhere in cadence_core, so it
// builds on the ESP32 and on a PC (test/native). Time is always milliseconds
// from any monotonic clock (millis() on the band).

#include <cmath>
#include <cstdint>

namespace cadence {

/** One accelerometer reading, in g (1 g = gravity at rest). */
struct Accel {
  float x;
  float y;
  float z;

  float magnitude() const { return std::sqrt(x * x + y * y + z * z); }
};

}  // namespace cadence
