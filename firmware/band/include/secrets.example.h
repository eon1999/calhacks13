#pragma once

// Copy this file to secrets.h (git-ignored) and fill it in.
// Register the band on /settings to get DEVICE_ID and DEVICE_TOKEN.

#define WIFI_SSID "your-wifi"
#define WIFI_PASSWORD "your-wifi-password"

// Your Convex HTTP actions URL, no trailing slash. A local `npx convex dev`
// backend only listens on 127.0.0.1, which the band can't reach: use the
// cloud deployment (https://<name>.convex.site).
#define CADENCE_URL "https://your-deployment.convex.site"

#define DEVICE_ID "band-1"
#define DEVICE_TOKEN "paste-the-token-from-settings"

// Optional: the PEM root certificate for CADENCE_URL. Without it HTTPS is still
// encrypted, but the band doesn't check who it is talking to.
// #define CADENCE_ROOT_CA "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
