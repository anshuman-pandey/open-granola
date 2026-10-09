import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "jsdom",
    // Let jsdom own browser storage instead of Node 25's file-backed global.
    execArgv: ["--no-experimental-webstorage"],
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
