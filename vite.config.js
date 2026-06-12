import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the built site path-independent, so it works at
// https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
