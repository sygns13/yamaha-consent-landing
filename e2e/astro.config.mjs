// @ts-check
import { mergeConfig } from "astro/config";
import config from "../astro.config.mjs";

// Build de las pruebas e2e (playwright.config.ts): mismo sitio, pero en dist-e2e/ para no pisar dist/, que es lo
// que se despliega, porque se construye con URLs de API ficticias.
export default mergeConfig(config, { outDir: "./dist-e2e" });
