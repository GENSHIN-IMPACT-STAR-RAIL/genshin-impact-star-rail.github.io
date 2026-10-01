import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  // 关键：GitHub Pages 托管在 https://<user>.github.io/<repo>/ 子路径下，
  // 默认的 base "/" 会让产物去请求 https://<user>.github.io/assets/xxx.js → 404 → 白屏
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        pure: "pure.html",
        statistics: "statistics.html",
        statisticsDemo: "statistics-demo.html",
        ode: "ode.html",
        mechanics: "mechanics.html",
        mechanicsDemo: "mechanics-demo.html",
        objects: "mechanics-objects.html",
      },
    },
  },
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
});
