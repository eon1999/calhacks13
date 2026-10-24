// Step counting and fall detection, fed with synthetic wrist motion at 50 Hz.

#include "check.h"
#include "fall_detector.h"
#include "step_counter.h"
#include "synthetic.h"

using namespace cadence;

namespace {

constexpr uint32_t kSampleMs = 20;  // 50 Hz

uint32_t stepsFor(MotionSignal& signal, uint32_t durationMs) {
  StepCounter counter;
  for (uint32_t t = 0; t < durationMs; t += kSampleMs) counter.update(signal.at(t), t);
  return counter.total();
}

}  // namespace

TEST("steps: a minute of walking at 1.8 steps/s counts about 108") {
  MotionSignal walk(1.8f, 0.3f);
  CHECK_NEAR(stepsFor(walk, 60000), 108, 8);
}

TEST("steps: a brisk walk at 2.2 steps/s counts about 132") {
  MotionSignal walk(2.2f, 0.4f);
  CHECK_NEAR(stepsFor(walk, 60000), 132, 10);
}

TEST("steps: sitting still counts nothing") {
  MotionSignal still(0.0f, 0.0f);
  CHECK(stepsFor(still, 60000) == 0);
}

TEST("steps: two or three bumps are not walking") {
  StepCounter counter;
  MotionSignal still(0.0f, 0.0f);
  for (uint32_t t = 0; t < 10000; t += kSampleMs) {
    Accel a = still.at(t);
    // Bumps at 2 s, 2.5 s and 6 s: never four in a row.
    if ((t >= 2000 && t < 2100) || (t >= 2500 && t < 2600) || (t >= 6000 && t < 6100)) a.z += 0.6f;
    counter.update(a, t);
  }
  CHECK(counter.total() == 0);
}

TEST("fall: impact then lying still is a fall, with the peak") {
  FallDetector detector;
  int falls = 0;
  for (uint32_t t = 0; t < 5000; t += kSampleMs) falls += detector.update(fallAt(t, 3.5f), t) ? 1 : 0;
  CHECK(falls == 1);
  CHECK_NEAR(detector.peakG(), 3.5, 0.2);
}

TEST("fall: walking never looks like a fall") {
  FallDetector detector;
  MotionSignal walk(2.0f, 0.5f);
  bool fell = false;
  for (uint32_t t = 0; t < 120000; t += kSampleMs) fell |= detector.update(walk.at(t), t);
  CHECK(!fell);
}

TEST("fall: a hard bump followed by more walking is cancelled") {
  FallDetector detector;
  MotionSignal walk(2.0f, 0.5f);
  bool fell = false;
  for (uint32_t t = 0; t < 8000; t += kSampleMs) {
    Accel a = walk.at(t);
    if (t >= 1000 && t < 1060) a = {0.0f, 0.0f, 3.2f};
    fell |= detector.update(a, t);
  }
  CHECK(!fell);
}

TEST("fall: a soft impact under the threshold is ignored") {
  FallDetector detector;
  bool fell = false;
  for (uint32_t t = 0; t < 5000; t += kSampleMs) fell |= detector.update(fallAt(t, 2.0f), t);
  CHECK(!fell);
}

TEST("fall: a second fall inside the cooldown is not reported twice") {
  FallDetector detector;
  int falls = 0;
  for (uint32_t t = 0; t < 5000; t += kSampleMs) falls += detector.update(fallAt(t, 3.5f), t) ? 1 : 0;
  for (uint32_t t = 0; t < 5000; t += kSampleMs) falls += detector.update(fallAt(t, 3.5f), 5000 + t) ? 1 : 0;
  CHECK(falls == 1);
  for (uint32_t t = 0; t < 5000; t += kSampleMs) falls += detector.update(fallAt(t, 3.5f), 20000 + t) ? 1 : 0;
  CHECK(falls == 2);
}

TEST("fall: a hard knock with no free fall first is not a fall") {
  // Slapping a table, then resting the arm: impact and stillness, but the wrist never dropped.
  FallDetector detector;
  bool fell = false;
  for (uint32_t t = 0; t < 5000; t += kSampleMs) {
    Accel a{0.0f, 0.0f, 1.0f};
    if (t >= 1000 && t < 1060) a = {0.0f, 0.0f, 3.2f};
    fell |= detector.update(a, t);
  }
  CHECK(!fell);
}
