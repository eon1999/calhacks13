import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // tests/convex runs Convex functions against convex-test's in-memory backend.
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
