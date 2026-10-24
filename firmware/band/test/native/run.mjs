// Builds and runs the band's core-logic tests on this computer (no ESP32, no
// PlatformIO): npm run firmware:test. Needs g++ or clang++ on PATH; set CXX
// to pick another compiler.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const core = join(here, "..", "..", "lib", "cadence_core", "src");
const out = join(here, "..", "..", ".build");
const exe = join(out, process.platform === "win32" ? "core-tests.exe" : "core-tests");

const cpp = (dir) => readdirSync(dir).filter((f) => f.endsWith(".cpp")).map((f) => join(dir, f));
const compiler = process.env.CXX ?? "g++";

mkdirSync(out, { recursive: true });
try {
  execFileSync(
    compiler,
    ["-std=c++17", "-Wall", "-Wextra", "-Werror", "-O1", `-I${core}`, ...cpp(core), ...cpp(here), "-o", exe],
    { stdio: "inherit" },
  );
} catch {
  console.error(`\nBuild failed (compiler: ${compiler}).`);
  process.exit(1);
}

try {
  execFileSync(exe, { stdio: "inherit" });
} catch {
  process.exit(1);
}
