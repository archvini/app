import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tudo que começa com /api vai para o backend (evita problema de CORS/cookie no desenvolvimento)
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3001" } },
});
