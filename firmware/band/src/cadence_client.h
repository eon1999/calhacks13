#pragma once

#include <cstddef>

/** Posts JSON to the device API with the band's bearer token. */
class CadenceClient {
 public:
  /** `rootCa` is a PEM certificate, or nullptr to skip checking the server (HTTPS only). */
  CadenceClient(const char* baseUrl, const char* token, const char* rootCa)
      : baseUrl_(baseUrl), token_(token), rootCa_(rootCa) {}

  /**
   * POSTs `body` to baseUrl + path. Returns the HTTP status, or a negative
   * number if there was no answer. The reply body goes into `reply`, cut to fit.
   */
  int post(const char* path, const char* body, char* reply, size_t replySize);

 private:
  const char* baseUrl_;
  const char* token_;
  const char* rootCa_;
};
