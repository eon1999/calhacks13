#include "cadence_client.h"

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include <cstring>

#include "config.h"

int CadenceClient::post(const char* path, const char* body, char* reply, size_t replySize) {
  if (replySize > 0) reply[0] = '\0';
  if (WiFi.status() != WL_CONNECTED) return -1;

  const String url = String(baseUrl_) + path;
  const bool https = std::strncmp(baseUrl_, "https://", 8) == 0;
  WiFiClientSecure secure;
  WiFiClient plain;
  if (https) {
    if (rootCa_) {
      secure.setCACert(rootCa_);
    } else {
      secure.setInsecure();
    }
  }

  HTTPClient http;
  http.setTimeout(config::kHttpTimeoutMs);
  if (!(https ? http.begin(secure, url) : http.begin(plain, url))) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + token_);

  const int status = http.POST(String(body));
  if (status > 0 && replySize > 0) {
    const String text = http.getString();
    strlcpy(reply, text.c_str(), replySize);
  }
  http.end();
  return status;
}
