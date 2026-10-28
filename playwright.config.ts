import { defineConfig, devices } from "@playwright/test";
import { E2E_API_BASE_URL, E2E_PRIVACY_POLICY_URL } from "./e2e/mock-api";

const PORT = 4322;

// Pruebas e2e contra el build de producción, sin backend: la API se simula con page.route (e2e/mock-api.ts). El
// build usa URLs ficticias, así que e2e/astro.config.mjs lo deja en dist-e2e/ para no pisar dist/, que es lo que
// se despliega.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx astro build --config e2e/astro.config.mjs && npx astro preview --config e2e/astro.config.mjs --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}/gracias`,
    // Siempre un build nuevo: un servidor ya abierto en el puerto podría servir otro build.
    reuseExistingServer: false,
    timeout: 120_000,
    // Las variables del proceso tienen prioridad sobre .env: el build no depende del .env local.
    env: {
      PUBLIC_API_BASE_URL: E2E_API_BASE_URL,
      PUBLIC_PRIVACY_POLICY_URL: E2E_PRIVACY_POLICY_URL,
    },
  },
});
