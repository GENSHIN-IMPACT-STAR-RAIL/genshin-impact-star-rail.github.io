import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
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
