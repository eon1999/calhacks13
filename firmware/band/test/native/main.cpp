#include <cstdio>

#include "check.h"

int main() {
  int failedCases = 0;
  for (const auto& c : check::cases()) {
    const int before = check::failures();
    c.run();
    const bool ok = check::failures() == before;
    if (!ok) ++failedCases;
    std::printf("%s %s\n", ok ? "  ok  " : "  FAIL", c.name);
  }
  const auto total = static_cast<int>(check::cases().size());
  std::printf("\n%d/%d passed\n", total - failedCases, total);
  return failedCases == 0 ? 0 : 1;
}
