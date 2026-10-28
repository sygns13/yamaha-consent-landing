import type { Page, Route } from "@playwright/test";

/** URLs de build ficticias (playwright.config.ts): la API nunca se llama de verdad. */
export const E2E_API_BASE_URL = "http://api.e2e.test";
export const E2E_PRIVACY_POLICY_URL = "https://politica.e2e.test/privacidad";

export const TOKEN = "token-e2e";

const LINK_URL = `${E2E_API_BASE_URL}/api/v1/public/consent-links/${TOKEN}`;

// Credenciales omitidas en api.ts: con "*" basta para que el navegador acepte la respuesta cruzada.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST",
  "access-control-allow-headers": "content-type",
};

export type LinkStatus = "VALID" | "EXPIRED" | "USED";

export interface Answers {
  personal_data: boolean;
  marketing_yamaha: boolean;
  marketing_dealer: boolean;
}

/** Cómo responde la API simulada a cada llamada: JSON con un estado HTTP, o un corte de red. */
export type MockResponse = { status: number; body: unknown } | "network-error";

export function linkInfo(linkStatus: LinkStatus): MockResponse {
  return {
    status: 200,
    body: { link_status: linkStatus, privacy_policy_url: null, dealer_display_name: null },
  };
}

export function submitted(status: "ACEPTADO" | "NO_ACEPTADO"): MockResponse {
  return { status: 200, body: { status } };
}

async function respond(route: Route, response: MockResponse): Promise<void> {
  if (response === "network-error") {
    await route.abort("internetdisconnected");
  } else {
    await route.fulfill({ status: response.status, json: response.body, headers: CORS_HEADERS });
  }
}

/** Preflight CORS del POST con JSON, por si llega al handler. */
async function handledPreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== "OPTIONS") return false;
  await route.fulfill({ status: 204, headers: CORS_HEADERS });
  return true;
}

/**
 * Simula los dos endpoints públicos del token de prueba. Cada llamada toma la siguiente respuesta de su lista y la
 * última se repite. `beforeSubmitResponse` permite retener la respuesta del envío (p. ej. hasta un doble clic).
 * Devuelve lo que la página llamó: cuántos GET y el cuerpo de cada POST.
 */
export async function mockApi(
  page: Page,
  options: {
    link?: MockResponse[];
    submit?: MockResponse[];
    beforeSubmitResponse?: () => Promise<void>;
  },
): Promise<{ linkCalls: () => number; submits: Answers[] }> {
  const link = options.link ?? [linkInfo("VALID")];
  const submit = options.submit ?? [submitted("ACEPTADO")];
  let linkCalls = 0;
  const submits: Answers[] = [];

  await page.route(LINK_URL, async (route) => {
    if (await handledPreflight(route)) return;
    await respond(route, link[Math.min(linkCalls++, link.length - 1)]!);
  });
  await page.route(`${LINK_URL}/submit`, async (route) => {
    if (await handledPreflight(route)) return;
    const index = submits.push(route.request().postDataJSON() as Answers) - 1;
    await options.beforeSubmitResponse?.();
    await respond(route, submit[Math.min(index, submit.length - 1)]!);
  });

  return { linkCalls: () => linkCalls, submits };
}
