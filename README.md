# yamaha-consent-landing

Landing de conformidad (Astro, sitio estático) de la plataforma de conformidades de datos personales.
La especificación completa está en `REQUERIMIENTOS_TECNICOS.md` (módulo M6).

## Requisitos locales

- Node.js **24 LTS** (Astro 7 requiere Node >= 22.23.4)
- Backend `yamaha-consent-api` corriendo en http://localhost:8000

## Levantar en local

```bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # http://localhost:4321
```

## Comandos

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Verifica tipos (`astro check`) y genera el sitio en `dist/` |
| `npm run preview` | Sirve `dist/` para revisarlo como en producción |

## Variables de entorno (build)

| Variable | Descripción |
|---|---|
| `PUBLIC_API_BASE_URL` | URL base del backend |
| `PUBLIC_PRIVACY_POLICY_URL` | URL de la política de privacidad (PENDIENTE-14) |

## Despliegue (Firebase Hosting, manual)

```bash
npm install -g firebase-tools
firebase login
firebase use <ID_PROYECTO_GCP>
npm run build
firebase deploy --only hosting
```
