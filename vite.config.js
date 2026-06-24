import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  }
});
