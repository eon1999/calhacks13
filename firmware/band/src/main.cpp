// Cadence wristband: counts steps, reads heart rate, spots falls and SOS
// presses, and reports them to the device API (README "Device API").
//
// Two FreeRTOS tasks share one lock-protected state:
//   sensors  50 Hz: motion, pulse, SOS button, LED and buzz. Never blocks on
//            the network, so a fall during a slow request isn't missed.
//   loop()   Wi-Fi and HTTP: events, heartbeats, activity windows.

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <Wire.h>

#include <cstring>
#include <memory>
#include <mutex>

#include "activity_window.h"
#include "beat_detector.h"
#include "cadence_client.h"
#include "config.h"
#include "fall_detector.h"
#include "hold_button.h"
#include "indicator.h"
#include "payloads.h"
#include "step_counter.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and fill it in"
#endif

#ifdef CADENCE_SIM
#include "sensors/sim.h"
#else
#include "sensors/max30102.h"
#include "sensors/mpu6050.h"
#endif

#ifdef CADENCE_ROOT_CA
constexpr const char* kRootCa = CADENCE_ROOT_CA;
#else
constexpr const char* kRootCa = nullptr;
#endif

namespace {

/** Everything both tasks touch. Hold `lock` for any access. */
struct Shared {
  std::mutex lock;
  cadence::ActivityWindow window;
  cadence::Commands commands{cadence::Led::Off, false};
  bool hasCommands = false;
  uint32_t commandsAtMs = 0;
  bool fallPending = false;
  float fallPeakG = 0.0f;
  bool sosPending = false;
};

Shared shared;
CadenceClient client(CADENCE_URL, DEVICE_TOKEN, kRootCa);
Indicator indicator(config::kPinLed, config::kPinBuzz);
HoldButton sosButton(config::kPinSosButton, config::kSosHoldMs);
std::unique_ptr<MotionSensor> motion;
std::unique_ptr<PulseSensor> pulse;

#ifdef CADENCE_SIM
SimControl sim;

/** Serial commands for the sim build. Returns true if SOS was asked for. */
bool handleSimInput(uint32_t nowMs) {
  bool sos = false;
  while (Serial.available() > 0) {
    switch (Serial.read()) {
      case 'w':
        sim.walking = !sim.walking;
        Serial.printf("[sim] %s\n", sim.walking ? "walking" : "sitting still");
        break;
      case 'f':
        sim.hasFall = true;
        sim.fallStartMs = nowMs;
        Serial.println("[sim] falling");
        break;
      case 's':
        sos = true;
        break;
      case 'o':
        sim.offWrist = !sim.offWrist;
        Serial.printf("[sim] band %s\n", sim.offWrist ? "off the wrist" : "back on");
        break;
      case 'h':
      case '?':
        Serial.println("[sim] w walk/stop, f fall, s SOS, o band off/on");
        break;
      default:
        break;
    }
  }
  return sos;
}
#endif

void sensorTask(void*) {
  cadence::StepCounter steps;
  cadence::FallDetector falls;
  cadence::BeatDetector beats(config::kNoContactIr);
  uint32_t lastHeartRateMs = 0;
  TickType_t wake = xTaskGetTickCount();

  for (;;) {
    vTaskDelayUntil(&wake, pdMS_TO_TICKS(config::kSampleMs));
    const uint32_t now = millis();

    bool fell = false;
    cadence::Accel a{};
    if (motion && motion->read(now, a)) {
      steps.update(a, now);
      fell = falls.update(a, now);
    }
    uint32_t ir = 0;
    uint32_t sampleMs = 0;
    while (pulse && pulse->read(now, ir, sampleMs)) beats.update(ir, sampleMs);

    bool sos = sosButton.update(now);
#ifdef CADENCE_SIM
    sos |= handleSimInput(now);
#endif
    const uint8_t bpm = beats.bpm(now);
    const bool sampleHeartRate = bpm > 0 && now - lastHeartRateMs >= config::kHeartRateEveryMs;
    if (sampleHeartRate) lastHeartRateMs = now;

    cadence::Commands commands{};
    {
      std::lock_guard<std::mutex> guard(shared.lock);
      shared.window.tick(steps.total(), now);
      if (sampleHeartRate) shared.window.addHeartRate(bpm);
      if (fell) {
        shared.fallPending = true;
        shared.fallPeakG = falls.peakG();
      }
      if (sos) shared.sosPending = true;
      // Signed: the heartbeat may be stamped a moment after this task's `now`.
      const auto age = static_cast<int32_t>(now - shared.commandsAtMs);
      const bool fresh = shared.hasCommands && age < static_cast<int32_t>(config::kCommandsExpireMs);
      commands = fresh ? shared.commands : cadence::Commands{cadence::Led::Off, false};
    }
    if (fell) Serial.printf("[band] fall detected, peak %.1f g\n", static_cast<double>(falls.peakG()));
    if (sos) Serial.println("[band] SOS");
    if (fell || sos) indicator.chirp(now);
    indicator.show(commands);
    indicator.update(now);
  }
}

// ---- network (loop task) ----

char body[160];
char reply[256];
uint32_t lastWifiAttemptMs = 0;
uint32_t lastEventAttemptMs = 0;
uint32_t lastHeartbeatMs = 0;
uint32_t lastWindowMs = 0;
bool sentFirstHeartbeat = false;

bool ok(int status) { return status >= 200 && status < 300; }

void logPost(const char* what, int status) {
  if (ok(status)) {
    Serial.printf("[net] %s → %d %s\n", what, status, reply);
  } else if (status == 401 || status == 403) {
    Serial.printf("[net] %s → %d %s  (check DEVICE_ID / DEVICE_TOKEN against /settings)\n", what, status, reply);
  } else if (status < 0) {
    Serial.printf("[net] %s → no answer (%s)\n", what, HTTPClient::errorToString(status).c_str());
  } else {
    Serial.printf("[net] %s → %d %s\n", what, status, reply);
  }
}

void ensureWifi(uint32_t nowMs) {
  if (WiFi.status() == WL_CONNECTED) return;
  if (lastWifiAttemptMs != 0 && nowMs - lastWifiAttemptMs < config::kWifiRetryMs) return;
  lastWifiAttemptMs = nowMs;
  Serial.printf("[net] connecting to %s\n", WIFI_SSID);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void sendEvents(uint32_t nowMs) {
  if (lastEventAttemptMs != 0 && nowMs - lastEventAttemptMs < config::kEventRetryMs) return;
  bool fall = false;
  bool sos = false;
  float peakG = 0.0f;
  {
    // Take the events now: a new one raised during the request stays pending.
    std::lock_guard<std::mutex> guard(shared.lock);
    fall = shared.fallPending;
    sos = shared.sosPending;
    peakG = shared.fallPeakG;
    shared.fallPending = false;
    shared.sosPending = false;
  }
  if (!fall && !sos) return;
  lastEventAttemptMs = nowMs;

  // SOS first: it's the one the wearer asked for.
  if (sos && cadence::sosJson(body, sizeof body, DEVICE_ID) > 0) {
    const int status = client.post("/device/event", body, reply, sizeof reply);
    logPost("sos", status);
    if (!ok(status)) {
      std::lock_guard<std::mutex> guard(shared.lock);
      shared.sosPending = true;
    }
  }
  if (fall && cadence::fallJson(body, sizeof body, DEVICE_ID, peakG) > 0) {
    const int status = client.post("/device/event", body, reply, sizeof reply);
    logPost("fall", status);
    if (!ok(status)) {
      std::lock_guard<std::mutex> guard(shared.lock);
      if (!shared.fallPending) shared.fallPeakG = peakG;  // keep a newer fall's peak if there is one
      shared.fallPending = true;
    }
  }
}

void sendHeartbeat() {
  if (cadence::heartbeatJson(body, sizeof body, DEVICE_ID, FIRMWARE_VERSION) < 0) return;
  const int status = client.post("/device/heartbeat", body, reply, sizeof reply);
  logPost("heartbeat", status);
  cadence::Commands commands{};
  if (ok(status) && cadence::parseCommands(reply, commands)) {
    std::lock_guard<std::mutex> guard(shared.lock);
    shared.commands = commands;
    shared.hasCommands = true;
    shared.commandsAtMs = millis();
  }
}

void sendActivity() {
  cadence::ActivitySummary summary{};
  {
    std::lock_guard<std::mutex> guard(shared.lock);
    summary = shared.window.snapshot();
  }
  if (cadence::activityJson(body, sizeof body, DEVICE_ID, summary) < 0) return;
  const int status = client.post("/device/activity", body, reply, sizeof reply);
  logPost("activity", status);
  // Only clear what the server took; anything newer, or a failed window, rolls into the next one.
  if (ok(status)) {
    std::lock_guard<std::mutex> guard(shared.lock);
    shared.window.commit(summary);
  }
}

[[noreturn]] void halt(const char* why) {
  Serial.printf("[band] stopped: %s\n", why);
  for (;;) delay(1000);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n[band] Cadence band %s (%s) as %s → %s\n", FIRMWARE_VERSION,
#ifdef CADENCE_SIM
                "simulated sensors",
#else
                "MPU6050 + MAX30102",
#endif
                DEVICE_ID, CADENCE_URL);
  if (!cadence::validDeviceId(DEVICE_ID)) halt("DEVICE_ID must be 2-64 letters, numbers, - or _");
  if (!kRootCa && std::strncmp(CADENCE_URL, "https://", 8) == 0) {
    Serial.println("[band] WARNING: no CADENCE_ROOT_CA, so the server isn't verified and the token could be intercepted");
  }

  indicator.begin();
  sosButton.begin();

#ifdef CADENCE_SIM
  motion = std::make_unique<SimMotion>(sim);
  pulse = std::make_unique<SimPulse>(sim);
  Serial.println("[sim] w walk/stop, f fall, s SOS, o band off/on");
#else
  Wire.begin(config::kPinSda, config::kPinScl);
  motion = std::make_unique<Mpu6050>(Wire);
  pulse = std::make_unique<Max30102>(Wire, config::kPinSda, config::kPinScl);
#endif
  if (!motion->begin()) {
    Serial.println("[band] no motion sensor: steps and falls are off");
    motion.reset();
  }
  if (!pulse->begin()) {
    Serial.println("[band] no pulse sensor: heart rate is off");
    pulse.reset();
  }

  WiFi.mode(WIFI_STA);
  ensureWifi(millis());
  lastWindowMs = millis();
  // Core 1 alongside loop(), at a higher priority so sampling preempts HTTP.
  // 8 KB: printf of floats and the I2C drivers need more than the 4 KB default.
  xTaskCreatePinnedToCore(sensorTask, "sensors", 8192, nullptr, 2, nullptr, 1);
}

void loop() {
  const uint32_t now = millis();
  ensureWifi(now);
  if (WiFi.status() != WL_CONNECTED) {
    delay(100);
    return;
  }
  sendEvents(now);
  if (!sentFirstHeartbeat || now - lastHeartbeatMs >= config::kHeartbeatMs) {
    sentFirstHeartbeat = true;
    lastHeartbeatMs = now;
    sendHeartbeat();
  }
  if (now - lastWindowMs >= config::kWindowMs) {
    lastWindowMs = now;
    sendActivity();
  }
  delay(20);
}
