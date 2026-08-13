import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@/infra",
        replacement: path.resolve(__dirname, "./infra"),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: "server-only",
        replacement: path.resolve(
          __dirname,
          "./src/test-utils/empty-server-only.ts"
        ),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
