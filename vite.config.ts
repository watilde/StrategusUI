/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves project sites under /<repo>/.
// Override with BASE_PATH=/ for a user/org site or a custom domain.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/StrategusUI/",
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
