// Activity windows and the JSON the band sends.

#include <cstring>
#include <string>

#include "activity_window.h"
#include "check.h"
#include "payloads.h"

using namespace cadence;

TEST("window: counts steps since the last post, not since boot") {
  ActivityWindow w;
  w.tick(1000, 0);  // steps before the first tick belong to no window
  w.tick(1250, 30000);
  CHECK(w.snapshot().steps == 250);
  w.commit(w.snapshot());
  w.tick(1300, 40000);
  CHECK(w.snapshot().steps == 50);
}

TEST("window: steps taken while a post is in flight stay for the next one") {
  ActivityWindow w;
  w.tick(0, 0);
  w.tick(100, 10000);
  const ActivitySummary sent = w.snapshot();
  w.tick(130, 11000);  // arrives during the HTTP request
  w.commit(sent);
  CHECK(w.snapshot().steps == 30);
}

TEST("window: a failed post rolls into the next window") {
  ActivityWindow w;
  w.tick(0, 0);
  w.tick(100, 10000);
  w.tick(180, 20000);  // no commit: the first post failed
  CHECK(w.snapshot().steps == 180);
}

TEST("window: a minute with enough steps is an active minute") {
  ActivityWindow w;
  w.tick(0, 0);
  w.tick(90, 60000);   // minute 1: 90 steps → active
  w.tick(100, 120000); // minute 2: 10 steps → not
  w.tick(160, 180000); // minute 3: 60 steps → active
  CHECK(w.snapshot().activeMinutes == 2);
  w.commit(w.snapshot());
  CHECK(w.snapshot().activeMinutes == 0);
}

TEST("window: heart rate is the window's average, 0 with no readings") {
  ActivityWindow w;
  CHECK(w.snapshot().heartRate == 0);
  w.addHeartRate(70);
  w.addHeartRate(80);
  w.addHeartRate(0);  // ignored
  CHECK(w.snapshot().heartRate == 75);
  w.commit(w.snapshot());
  CHECK(w.snapshot().heartRate == 0);
}

TEST("json: activity with heart rate") {
  char buf[128];
  const int n = activityJson(buf, sizeof buf, "band-1", {420, 6, 92});
  CHECK(n > 0);
  CHECK(std::string(buf) == R"({"deviceId":"band-1","steps":420,"activeMinutes":6,"heartRate":92})");
}

TEST("json: activity without a pulse leaves heartRate out") {
  char buf[128];
  activityJson(buf, sizeof buf, "band-1", {0, 0, 0});
  CHECK(std::string(buf) == R"({"deviceId":"band-1","steps":0,"activeMinutes":0})");
}

TEST("json: events and heartbeat") {
  char buf[128];
  fallJson(buf, sizeof buf, "band-1", 3.46f);
  CHECK(std::string(buf) == R"({"deviceId":"band-1","type":"fall","peakG":3.5})");
  sosJson(buf, sizeof buf, "band-1");
  CHECK(std::string(buf) == R"({"deviceId":"band-1","type":"sos"})");
  heartbeatJson(buf, sizeof buf, "band-1", "0.1.0");
  CHECK(std::string(buf) == R"({"deviceId":"band-1","firmwareVersion":"0.1.0"})");
}

TEST("json: too small a buffer is an error, not a cut-off body") {
  char buf[16];
  CHECK(activityJson(buf, sizeof buf, "band-1", {420, 6, 92}) == -1);
}

TEST("commands: reads led and buzz") {
  Commands c{};
  CHECK(parseCommands(R"({"led":"due","buzz":true})", c));
  CHECK(c.led == Led::Due && c.buzz);
  CHECK(parseCommands(R"({ "buzz": false, "led": "missed" })", c));
  CHECK(c.led == Led::Missed && !c.buzz);
  CHECK(parseCommands(R"({"led":"taken","buzz":false})", c) && c.led == Led::Taken);
  CHECK(parseCommands(R"({"led":"off","buzz":false})", c) && c.led == Led::Off);
}

TEST("commands: rejects missing or unknown values") {
  Commands c{};
  CHECK(!parseCommands(R"({"led":"blue","buzz":true})", c));
  CHECK(!parseCommands(R"({"led":"due"})", c));
  CHECK(!parseCommands(R"({"error":"Unknown device token"})", c));
  CHECK(!parseCommands("", c));
}

TEST("device id: matches what the server accepts") {
  CHECK(validDeviceId("band-1"));
  CHECK(validDeviceId("fake_band_dev"));
  CHECK(!validDeviceId("b"));
  CHECK(!validDeviceId("band 1"));
  CHECK(!validDeviceId("band\"1"));
  CHECK(!validDeviceId(std::string(65, 'a').c_str()));
}
