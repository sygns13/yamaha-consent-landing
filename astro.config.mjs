// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Sitio 100% estático (output: 'static') para Firebase Hosting.
export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
});
