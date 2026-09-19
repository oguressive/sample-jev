import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  server: { port: 3009, strictPort: true },
  plugins: [tanstackStart(), react()],
});
