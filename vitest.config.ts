import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "tests/unit/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["app/lib/**/*.ts"],
      exclude: ["app/lib/*.server.ts"],
    },
  },
});
