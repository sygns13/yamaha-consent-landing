/**
 * Cliente de la API pública de la landing (M4). Es el único lugar que llama al backend.
 *
 * Nunca lanza excepciones: cada función devuelve un resultado discriminado por `kind`.
 * Los tipos reflejan los esquemas de docs/openapi.json.
 */

// Decisión del responsable: 15 s por llamada, incluida la lectura del cuerpo. No es configurable.
// La API no tiene un límite menor en estos endpoints (ver CLAUDE.md).
const REQUEST_TIMEOUT_MS = 15_000;

const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL.replace(/\/+$/, "");

// --- Esquemas de docs/openapi.json ---

/** `LinkStatus` */
export type LinkStatus = "VALID" | "EXPIRED" | "USED";

/** `ConsentSubmitResponse.status` */
export type ConsentStatus = "ACEPTADO" | "NO_ACEPTADO";

/** `ConsentLinkInfo`: respuesta 200 de GET /api/v1/public/consent-links/{token}. */
export interface ConsentLinkInfo {
  link_status: LinkStatus;
  privacy_policy_url: string | null;
  // TODO(PENDIENTE-05): hoy siempre null; la landing muestra "DEALER".
  dealer_display_name?: null;
}

/** `ConsentSubmitRequest`: los tres checks. La API rechaza (422) campos extra o valores que no sean booleanos. */
export interface ConsentSubmitRequest {
  personal_data: boolean;
  marketing_yamaha: boolean;
  marketing_dealer: boolean;
}

/** `ConsentSubmitResponse`: respuesta 200 de POST /api/v1/public/consent-links/{token}/submit. */
export interface ConsentSubmitResponse {
  status: ConsentStatus;
}

/** `LinkGoneResponse`: respuesta 410. */
export interface LinkGoneResponse {
  detail: string;
  link_status: Exclude<LinkStatus, "VALID">;
}

// --- Resultados ---

/** El enlace no se puede usar: la landing manda a /enlace-invalido. */
export type LinkUnavailable = { kind: "EXPIRED" } | { kind: "USED" } | { kind: "NOT_FOUND" };

/** Red caída, timeout, 5xx, 422 o respuesta inesperada: la landing muestra el error y permite reintentar. */
export type NetworkError = { kind: "NETWORK_ERROR" };

export type ConsentLinkResult = { kind: "VALID"; privacyPolicyUrl: string | null } | LinkUnavailable | NetworkError;

export type SubmitConsentResult = { kind: "SUBMITTED"; status: ConsentStatus } | LinkUnavailable | NetworkError;

const NETWORK_ERROR: NetworkError = { kind: "NETWORK_ERROR" };

// --- Endpoints ---

export async function getConsentLink(token: string): Promise<ConsentLinkResult> {
  const response = await request(linkPath(token), { method: "GET", cache: "no-store" });
  if (response === null) return NETWORK_ERROR;

  if (response.status === 200) {
    if (!isConsentLinkInfo(response.body)) return NETWORK_ERROR;
    const { link_status, privacy_policy_url } = response.body;
    return link_status === "VALID" ? { kind: "VALID", privacyPolicyUrl: privacy_policy_url } : { kind: link_status };
  }
  return unavailableResult(response) ?? NETWORK_ERROR;
}

export async function submitConsent(token: string, answers: ConsentSubmitRequest): Promise<SubmitConsentResult> {
  // Solo los tres campos: la API rechaza cualquier campo extra.
  const body: ConsentSubmitRequest = {
    personal_data: answers.personal_data,
    marketing_yamaha: answers.marketing_yamaha,
    marketing_dealer: answers.marketing_dealer,
  };
  const response = await request(`${linkPath(token)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response === null) return NETWORK_ERROR;

  if (response.status === 200) {
    return isConsentSubmitResponse(response.body) ? { kind: "SUBMITTED", status: response.body.status } : NETWORK_ERROR;
  }
  return unavailableResult(response) ?? NETWORK_ERROR;
}

// --- Internos ---

interface HttpResponse {
  status: number;
  body: unknown;
}

function linkPath(token: string): string {
  return `${API_BASE_URL}/api/v1/public/consent-links/${encodeURIComponent(token)}`;
}

/** Hace la petición con timeout. Devuelve null si no hubo respuesta (red, CORS o timeout). */
async function request(url: string, init: RequestInit): Promise<HttpResponse | null> {
  // AbortController + setTimeout en lugar de AbortSignal.timeout(): este último no existe en Safari 15,
  // que todavía puede ser el navegador interno de WhatsApp en iOS.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    // Cuerpo vacío, que no es JSON o cortado por el timeout → null; cada endpoint lo trata como inesperado.
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 404 → NOT_FOUND; 410 según su link_status. Cualquier otro código → null. */
function unavailableResult(response: HttpResponse): LinkUnavailable | null {
  if (response.status === 404) return { kind: "NOT_FOUND" };
  if (response.status !== 410) return null;
  if (isLinkGoneResponse(response.body)) return { kind: response.body.link_status };
  // 410 sin un link_status reconocible: el enlace no está disponible pero no se sabe por qué.
  // Reintentar no cambiaría nada, así que va a /enlace-invalido sin motivo, igual que un 404.
  return { kind: "NOT_FOUND" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLinkStatus(value: unknown): value is LinkStatus {
  return value === "VALID" || value === "EXPIRED" || value === "USED";
}

function isConsentLinkInfo(value: unknown): value is ConsentLinkInfo {
  return (
    isRecord(value) &&
    isLinkStatus(value.link_status) &&
    (value.privacy_policy_url === null || typeof value.privacy_policy_url === "string")
  );
}

function isConsentSubmitResponse(value: unknown): value is ConsentSubmitResponse {
  return isRecord(value) && (value.status === "ACEPTADO" || value.status === "NO_ACEPTADO");
}

function isLinkGoneResponse(value: unknown): value is LinkGoneResponse {
  return isRecord(value) && (value.link_status === "EXPIRED" || value.link_status === "USED");
}
