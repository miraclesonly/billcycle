import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Set by the GitHub Pages workflow to /<repo>/; "/" for Netlify or local dev.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  define: { global: "globalThis" },
  build: { chunkSizeWarningLimit: 2000 },
});
