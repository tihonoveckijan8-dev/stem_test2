import { defineConfig } from "vite";

export default defineConfig({
  // Project Pages are served from /stem_test2/, not the domain root.
  base: "/stem_test2/",
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  worker: { format: "es" },
});