# Cadence band firmware (ESP32)

Counts steps, reads heart rate, spots falls and SOS presses, and reports them to the [device API](../../README.md#device-api-for-firmware). The heartbeat reply drives the LED and buzz motor. Voice and display live on the phone (`/hub`), not the band.

Written before the hardware exists, so it's built to be developed without it:

| Without hardware | How |
| --- | --- |
| The logic (steps, falls, BPM, windows, JSON) | `npm run firmware:test` from the repo root: builds `lib/cadence_core` with g++ and runs it against synthetic signals |
| The whole firmware on a bare ESP32 board | `pio run -e band-sim -t upload`, then type in the serial monitor: `w` walk/stop, `f` fall, `s` SOS, `o` band off/on |
| The server side | `npm run fake-band` (no ESP32 at all) |

## Hardware it expects

| Part | Wiring (ESP32 DevKit) |
| --- | --- |
| MPU6050 accelerometer (I2C, 0x68) | SDA 21, SCL 22, 3.3 V |
| MAX30102 pulse sensor (I2C, 0x57) | same bus |
| LED | GPIO 2 (the blue LED on most dev boards) |
| Vibration motor via a transistor, or an active buzzer | GPIO 25 |
| SOS button to ground | GPIO 0 (the BOOT button): hold 2 s |

Pins and timings are in `include/config.h`. If a sensor doesn't answer at boot, the band keeps going without it and says so on serial.

## Build and flash

1. Install [PlatformIO](https://platformio.org/install/cli) (`pip install platformio`).
2. `cp include/secrets.example.h include/secrets.h` and fill in Wi-Fi, `CADENCE_URL` (the Convex `.site` URL), and the `DEVICE_ID` and `DEVICE_TOKEN` from registering the band on `/settings`. `secrets.h` is git-ignored.
3. From `firmware/band`: `pio run -e band -t upload` (or `-e band-sim`), then `pio device monitor`.

A local `npx convex dev` backend only listens on 127.0.0.1, so point a real board at the cloud deployment.

## How it works

`src/main.cpp` runs two FreeRTOS tasks that share one mutex-guarded state:

- **sensors** (50 Hz, higher priority) reads motion and pulse, runs the detectors, watches the SOS button and drives the LED and motor. It never waits on the network, so a fall during a slow request isn't missed.
- **loop()** handles Wi-Fi and HTTP. Falls and SOS go out at once and retry every 5 s until the server takes them. Heartbeats go every 30 s, and an activity window every 5 min (1 min in `band-sim`). If no heartbeat gets through for 90 s, the LED and motor go quiet rather than repeat an old reminder.

The logic is in `lib/cadence_core`, with no Arduino code, so it is the same code on the band and in the tests:

| File | What |
| --- | --- |
| `step_counter` | Removes gravity, smooths, counts rises. Steps only count in runs of 4, so waving isn't walking. |
| `fall_detector` | A drop (free fall under 0.5 g), an impact of 2.5 g or more within a second, then lying still for 1.5 s. A knock with no drop, or moving on afterwards, isn't a fall. One fall per 10 s. |
| `beat_detector` | The MAX30102 gives raw light levels, not BPM. A high-pass leaves the pulse wave; each dip is a beat; BPM is the average of 4 gaps, and odd gaps are dropped as motion noise. Reads 0 off the wrist or when stale. |
| `activity_window` | Per-window counts, as the server expects. A window is only cleared once the server took it, so a failed post rolls into the next one. |
| `payloads` | JSON bodies, and the heartbeat reply parser. |
| `synthetic` | Made-up motion, falls and pulse for the tests and `band-sim`. |

## Not done yet

- Not yet compiled for the ESP32 or run on a board: only the core logic is tested (on a PC).
- Thresholds are tuned on synthetic signals. Expect to retune `StepCounter`, `FallDetector` and `BeatDetector` with real wrist data. Wrist PPG is much noisier than a fingertip, and its IR level runs lower: check `config::kNoContactIr` (50000, a fingertip value) against real readings, or the band will always think it's off the wrist.
- A fall needs a drop before the impact. That cuts false alarms from knocks, but a slow slump to the floor may not count. Check with real falls (onto a mattress).
- HTTPS doesn't check the server's certificate unless you set `CADENCE_ROOT_CA` in `secrets.h`, so the token could be intercepted. The band warns about this at boot.
- Wi-Fi details are compiled in. No pairing mode yet.
- No battery reading, deep sleep or over-the-air updates.
- The pillbox (`firmware/med-station`, `lid_open`) is separate and not started.
