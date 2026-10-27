# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The workspace-level `../CLAUDE.md` covers the whole system (backend, business rules, deploy). This file covers only the landing.

## Current state

- This repo is the customer-facing landing, module **M6** of `REQUERIMIENTOS_TECNICOS.md` (the spec, in Spanish, is the source of truth). M6 has not started: the pages are placeholders that only prove the scaffold works.
- `REQUERIMIENTOS_TECNICOS.md` here is a copy of `../requerimientos/REQUERIMIENTOS_TECNICOS.md`. After any spec change, keep all three copies identical (`cp` + `cmp`).
- `docs/openapi.json` is a snapshot of the backend's OpenAPI schema. The landing only calls the two `/api/v1/public/consent-links/...` endpoints.
- `assets/mockup-landing.png` is the visual reference. The `assets/` folder holds spec images and is not served (`public/` is the served static folder).

## Rules (owner's decisions)

- Static Astro only (`output: "static"`). No UI framework: no React, Vue, Svelte, Preact, Solid or their `@astrojs/*` integrations. Interactivity is plain TypeScript in a page `<script>`.
- Tailwind CSS 4 using the `@theme` color tokens in `src/styles/global.css` (`brand`, `brand-dark`, `surface`). No hex values in markup (`bg-[#...]`); a new color becomes a token there first.
- All user-facing text is in Spanish. Code and identifiers stay in English (spec section 0).
- Every call to the backend goes through `src/lib/api.ts` (`getConsentLink`, `submitConsent`). No `fetch` anywhere else. Its functions never throw: they return a result discriminated by `kind` (`VALID`/`SUBMITTED`, `EXPIRED`, `USED`, `NOT_FOUND`, `NETWORK_ERROR`), and its types mirror the schemas in `docs/openapi.json`.
- Never use `window.alert` or `window.confirm`. Loading, errors and retries are shown inline in the page.
- Anything marked `PENDIENTE-n` in the spec gets only its "mientras tanto" behavior plus a `TODO(PENDIENTE-n)` comment at that spot in the code. Today that means PENDIENTE-05 (literal "DEALER") and PENDIENTE-14 (privacy-policy URL from env).

## Commands

- `npm run dev` → http://localhost:4321. Copy `.env.example` to `.env` first.
  - The backend must be running on port 8000 (`uv run uvicorn app.main:app --reload --port 8000` from `../yamaha-consent-api`).
  - The API's `CORS_ALLOWED_ORIGINS` must include `http://localhost:4321` (its `.env.example` already does).
- `npm run build` runs `astro check` (strict TypeScript) and then `astro build` into `dist/`. There is no separate lint or test command; `astro check` is the type gate.
- `npm run preview` serves `dist/`.
- To get a valid token for `/?t=...` locally, run `uv run python -m scripts.issue_local_link <transaction_id>` from `../yamaha-consent-api`. Tokens only exist in the WhatsApp message otherwise.
- Requires Node 24 LTS (Astro 7 needs Node >= 22.23.4).
- Deploy is manual: `npm run build` then `firebase deploy --only hosting`. Never run it unless asked.

## Architecture

- Astro 7, `output: "static"`, TypeScript strict, **no UI framework**. The form logic lives in a `<script>` inside the page. Everything token-related happens client-side at runtime, since the site is static.
- Tailwind CSS 4 via `@tailwindcss/vite` (no `tailwind.config`). Brand colors are `@theme` tokens in `src/styles/global.css` (`brand`, `brand-dark`, `surface`), taken from the mockup.
- `src/components/` have no JavaScript of their own; the page script drives them through attributes:
  - `ConsentCheckbox`: its `[data-privacy-link]` is rendered without `href`, and the page sets the URL after the GET. Without `href` it looks and reads as plain text.
  - `PrimaryButton`: `disabled` plus `aria-busy="true"` swaps the label for "Enviando...".
  - `Alert`: toggle `hidden` to show it. `role="alert"` announces it; hide and show it again to re-announce.
- `src/layouts/BaseLayout.astro` holds the shared header ("YAMAHA" + "Privacidad y consentimiento"), `lang="es"` and `noindex`. All three pages use it.
- Build-time env vars: `PUBLIC_API_BASE_URL` and `PUBLIC_PRIVACY_POLICY_URL` (PENDIENTE-14). They are typed in `src/env.d.ts`. Add any new `PUBLIC_*` var there and to `.env.example` and the README table.
- Hosting: Firebase Hosting, `firebase.json` with `public: "dist"` and `cleanUrls: true`, so pages are `/gracias` and `/enlace-invalido` without `.html`. The security headers there include `Referrer-Policy: no-referrer`, which keeps the `?t=` token from leaking to the privacy-policy site. Don't remove it.

## Page flow (spec M6 + M4 contract)

- `/` reads `t` from the query string.
  - No token → `/enlace-invalido`.
  - Otherwise `GET {PUBLIC_API_BASE_URL}/api/v1/public/consent-links/{t}` with a loading indicator. `200` with `link_status` `EXPIRED` → `/enlace-invalido?motivo=vencido`; `USED` → `?motivo=usado`; `404` → `/enlace-invalido` with no `motivo` (title only).
  - GET fails (network, timeout, `5xx`) → stay on the page, show the error message inline with a "Reintentar" button. Don't send the user to `/enlace-invalido`: the link may be fine.
- The three checkboxes start **unchecked**. **RN-01:** the ENVIAR button is always enabled, with no blocking validation and no confirmation dialog. All three unchecked is a valid submission (recorded as `NO_ACEPTADO`). The mockup's "* Autorización obligatoria para continuar" line is removed and check 1 has no asterisk.
- Submit: disable the button, then `POST .../{t}/submit` with `{"personal_data", "marketing_yamaha", "marketing_dealer"}` as real JSON booleans (all three required, no extra fields, or the API returns `422`).
  - `200` (`ACEPTADO` or `NO_ACEPTADO`) → `/gracias`.
  - `410` → `/enlace-invalido?motivo=vencido|usado` from the body's `link_status`. `404` → `/enlace-invalido`.
  - Network error, timeout, `5xx` or `422` → re-enable the button and show inline: "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo."
- Both calls abort after a fixed **15 s** (`AbortController`) and count as a network error. Owner's decision, not configurable. It was checked against the API: the public endpoints have no server-side limit below that (no DB `statement_timeout`/`lock_timeout`, Cloud Run default 300 s), and the API's 10 s timeouts (Twilio, KIZUNA) don't run inside these requests (KIZUNA runs after the response). A submit that times out may still commit; the retry then gets `410 USED`.
- Redirects use `location.replace()`, so Back never returns to an already-submitted form. The page has a `<noscript>` message in Spanish.
- Privacy-policy URL: `privacy_policy_url` from the GET; if `null`, `PUBLIC_PRIVACY_POLICY_URL`; if both are missing, the words "política de privacidad" without a link. `TODO(PENDIENTE-14)`.
- Every "política de privacidad" link opens in a new tab (`target="_blank" rel="noopener noreferrer"`), so the form and its checkboxes stay as they were (owner's decision, 27/10/2026). There is no modal: the policy is an external URL, and a cross-origin page can't be framed reliably or scroll-tracked. The links don't change any checkbox.
- `dealer_display_name` is always `null` for now (PENDIENTE-05): show the literal "DEALER".
- System font stack (Tailwind's default `font-sans`), no web fonts. Mobile-first; on desktop, a centered column with the header at full width.
- The UI copy is fixed by the spec (M6 "Textos") and is in Spanish. Use it verbatim.
- Acceptance: renders correctly at 360/768/1280 px, Lighthouse ≥ 90 for Performance and Accessibility on mobile, `<label>`s bound to the checkboxes, visible focus, AA contrast.
