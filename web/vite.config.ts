import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:3000" },
    // The public site reads server/lib/site.json, one level above web/.
    fs: { allow: [".."] },
  },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 600 },
});
