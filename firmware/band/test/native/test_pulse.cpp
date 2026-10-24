// Beat detection on synthetic PPG at 50 Hz.

#include "beat_detector.h"
#include "check.h"
#include "synthetic.h"

using namespace cadence;

namespace {

constexpr uint32_t kSampleMs = 20;

uint8_t bpmAfter(PulseSignal& signal, uint32_t durationMs) {
  BeatDetector detector;
  for (uint32_t t = 0; t < durationMs; t += kSampleMs) detector.update(signal.at(t), t);
  return detector.bpm(durationMs);
}

}  // namespace

TEST("pulse: resting 72 bpm reads 72") {
  PulseSignal pulse(72.0f);
  CHECK_NEAR(bpmAfter(pulse, 15000), 72, 3);
}

TEST("pulse: after a walk, 110 bpm reads 110") {
  PulseSignal pulse(110.0f);
  CHECK_NEAR(bpmAfter(pulse, 15000), 110, 4);
}

TEST("pulse: slow 50 bpm reads 50") {
  PulseSignal pulse(50.0f);
  CHECK_NEAR(bpmAfter(pulse, 20000), 50, 3);
}

TEST("pulse: follows a change in heart rate") {
  BeatDetector detector;
  PulseSignal pulse(70.0f);
  uint32_t t = 0;
  for (; t < 15000; t += kSampleMs) detector.update(pulse.at(t), t);
  pulse.setBpm(100.0f);
  for (; t < 40000; t += kSampleMs) detector.update(pulse.at(t), t);
  CHECK_NEAR(detector.bpm(t), 100, 4);
}

TEST("pulse: no reading before enough beats") {
  BeatDetector detector;
  PulseSignal pulse(72.0f);
  for (uint32_t t = 0; t < 1500; t += kSampleMs) detector.update(pulse.at(t), t);
  CHECK(detector.bpm(1500) == 0);
}

TEST("pulse: nothing on the sensor means no contact and no bpm") {
  BeatDetector detector;
  for (uint32_t t = 0; t < 10000; t += kSampleMs) detector.update(1200, t);
  CHECK(!detector.hasContact());
  CHECK(detector.bpm(10000) == 0);
}

TEST("pulse: taking the band off drops the reading") {
  BeatDetector detector;
  PulseSignal pulse(72.0f);
  uint32_t t = 0;
  for (; t < 15000; t += kSampleMs) detector.update(pulse.at(t), t);
  CHECK(detector.bpm(t) > 0);
  for (; t < 16000; t += kSampleMs) detector.update(900, t);
  CHECK(!detector.hasContact());
  CHECK(detector.bpm(t) == 0);
}

TEST("pulse: a reading goes stale when beats stop") {
  BeatDetector detector;
  PulseSignal pulse(72.0f);
  uint32_t t = 0;
  for (; t < 15000; t += kSampleMs) detector.update(pulse.at(t), t);
  // Flat signal, still on skin: no beats.
  for (; t < 20000; t += kSampleMs) detector.update(100000, t);
  CHECK(detector.bpm(t) == 0);
}

TEST("pulse: fast 150 bpm reads 150") {
  PulseSignal pulse(150.0f);
  CHECK_NEAR(bpmAfter(pulse, 15000), 150, 5);
}

TEST("pulse: a sample stamped before the last one doesn't reset the reading") {
  BeatDetector detector;
  PulseSignal pulse(72.0f);
  uint32_t t = 0;
  for (; t < 15000; t += kSampleMs) detector.update(pulse.at(t), t);
  detector.update(pulse.at(t), t - 200);  // FIFO burst stamped out of order
  CHECK_NEAR(detector.bpm(t), 72, 3);
}

TEST("pulse: asking just before the latest beat's timestamp still reads") {
  BeatDetector detector;
  PulseSignal pulse(72.0f);
  uint32_t t = 0;
  for (; t < 15000; t += kSampleMs) detector.update(pulse.at(t), t);
  CHECK(detector.bpm(t - 100) > 0);
}

TEST("pulse: the no-contact level can be set for the wrist") {
  BeatDetector detector(20000);
  PulseSignal pulse(72.0f);
  uint32_t t = 0;
  // Wrist readings sit lower than a fingertip's: shift the wave down to ~30000.
  for (; t < 15000; t += kSampleMs) detector.update(pulse.at(t) - 70000, t);
  CHECK(detector.hasContact());
  CHECK_NEAR(detector.bpm(t), 72, 3);
}
