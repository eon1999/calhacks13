#include "mpu6050.h"

namespace {
constexpr uint8_t kRegConfig = 0x1A;
constexpr uint8_t kRegAccelConfig = 0x1C;
constexpr uint8_t kRegAccelOut = 0x3B;
constexpr uint8_t kRegPowerMgmt = 0x6B;
constexpr uint8_t kRegWhoAmI = 0x75;

constexpr uint8_t kWake = 0x00;
constexpr uint8_t kLowPass44Hz = 0x03;
constexpr uint8_t kRange8g = 0x10;
constexpr float kCountsPerG = 4096.0f;  // at ±8 g
}  // namespace

bool Mpu6050::writeRegister(uint8_t reg, uint8_t value) {
  wire_.beginTransmission(address_);
  wire_.write(reg);
  wire_.write(value);
  return wire_.endTransmission() == 0;
}

bool Mpu6050::begin() {
  wire_.beginTransmission(address_);
  wire_.write(kRegWhoAmI);
  if (wire_.endTransmission(false) != 0) return false;
  if (wire_.requestFrom(address_, static_cast<uint8_t>(1)) != 1) return false;
  wire_.read();  // clones report 0x68, 0x70, 0x72 or 0x98: any answer will do
  return writeRegister(kRegPowerMgmt, kWake) && writeRegister(kRegConfig, kLowPass44Hz) &&
         writeRegister(kRegAccelConfig, kRange8g);
}

bool Mpu6050::read(uint32_t /*nowMs*/, cadence::Accel& out) {
  wire_.beginTransmission(address_);
  wire_.write(kRegAccelOut);
  if (wire_.endTransmission(false) != 0) return false;
  if (wire_.requestFrom(address_, static_cast<uint8_t>(6)) != 6) return false;
  int16_t raw[3];
  for (auto& axis : raw) {
    const auto hi = static_cast<uint8_t>(wire_.read());
    const auto lo = static_cast<uint8_t>(wire_.read());
    axis = static_cast<int16_t>((hi << 8) | lo);
  }
  out = {raw[0] / kCountsPerG, raw[1] / kCountsPerG, raw[2] / kCountsPerG};
  return true;
}
