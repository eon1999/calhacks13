#pragma once

#include <cstdint>

namespace cadence {

/**
 * Weight for one step of an exponential moving average with time constant
 * `tauMs`, given `dtMs` since the last sample. Time-based, so filters behave
 * the same at 25, 50 or 100 Hz.
 */
inline float emaWeight(uint32_t dtMs, float tauMs) {
  const auto dt = static_cast<float>(dtMs);
  return dt / (tauMs + dt);
}

}  // namespace cadence
