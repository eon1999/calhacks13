#pragma once

// A tiny test harness so the core logic tests build with any C++17 compiler
// and no downloads. TEST registers a case; CHECK* record failures and go on.

#include <cmath>
#include <cstdio>
#include <functional>
#include <vector>

namespace check {

struct Case {
  const char* name;
  std::function<void()> run;
};

inline std::vector<Case>& cases() {
  static std::vector<Case> all;
  return all;
}

inline int& failures() {
  static int count = 0;
  return count;
}

struct Register {
  Register(const char* name, std::function<void()> run) { cases().push_back({name, std::move(run)}); }
};

inline void fail(const char* file, int line, const char* what) {
  std::printf("  FAIL %s:%d  %s\n", file, line, what);
  ++failures();
}

}  // namespace check

#define CHECK_CAT2(a, b) a##b
#define CHECK_CAT(a, b) CHECK_CAT2(a, b)
#define TEST(name)                                                              \
  static void CHECK_CAT(test_, __LINE__)();                                     \
  static check::Register CHECK_CAT(reg_, __LINE__)(name, CHECK_CAT(test_, __LINE__)); \
  static void CHECK_CAT(test_, __LINE__)()

#define CHECK(cond) \
  do {              \
    if (!(cond)) check::fail(__FILE__, __LINE__, #cond); \
  } while (0)

#define CHECK_NEAR(actual, expected, tolerance)                                          \
  do {                                                                                   \
    const double a_ = (actual), e_ = (expected);                                         \
    if (std::fabs(a_ - e_) > (tolerance)) {                                              \
      char msg_[160];                                                                    \
      std::snprintf(msg_, sizeof msg_, "%s = %g, expected %g ± %g", #actual, a_, e_, (double)(tolerance)); \
      check::fail(__FILE__, __LINE__, msg_);                                             \
    }                                                                                    \
  } while (0)
