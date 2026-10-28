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
| `npm run test:e2e` | Pruebas e2e con Playwright (`e2e/`). Simulan la API, no necesitan el backend |

Antes de la primera ejecución de las pruebas e2e, instala el navegador con `npx playwright install chromium`.
Las pruebas construyen el sitio con URLs ficticias en `dist-e2e/` (no tocan `dist/`) y lo sirven en el puerto 4322.

## Variables de entorno (build)

| Variable | Descripción |
|---|---|
| `PUBLIC_API_BASE_URL` | URL base del backend (en Producción, la URL de Cloud Run) |
| `PUBLIC_PRIVACY_POLICY_URL` | URL de la política de privacidad (PENDIENTE-14) |

- Local: `.env` (copia de `.env.example`).
- Producción: `.env.production` (copia de `.env.production.example`). `npm run build` lo carga por encima de `.env`; `npm run dev` no lo usa.
- Las dos van incrustadas en el HTML publicado: nunca pongas secretos en ellas.

## Despliegue en Firebase Hosting (manual)

El despliegue es manual y solo a Producción (spec M6 y M7). La landing va en Firebase Hosting, dentro del **mismo proyecto de Google Cloud** que el backend, en el sitio `consent-landing`.

### Qué configura `firebase.json`

- `public: "dist"`: publica el resultado de `npm run build`.
- `cleanUrls: true` y `trailingSlash: false`: las páginas son `/`, `/gracias` y `/enlace-invalido`. `/gracias/` e `/index.html` redirigen a la URL limpia. Cualquier otra ruta responde 404 con `404.html` (página propia en español, `src/pages/404.astro`).
- `target: "landing"`: el sitio de destino no está escrito en el archivo. Se asigna una vez con `firebase target:apply` (paso 1.4) y queda en `.firebaserc`. Sin esa asignación, `firebase deploy` se niega a publicar.
- Cabeceras de seguridad en todas las respuestas:
  - `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` y `X-Frame-Options: DENY`.
  - `Referrer-Policy: no-referrer`, que evita filtrar el token `?t=` a la política de privacidad u otros sitios. **No la quites.**
- Caché:
  - Las páginas (rutas sin extensión) llevan `Cache-Control: no-cache`. El navegador revalida en cada visita, así que un despliegue nuevo, por ejemplo con otra URL de API, se ve de inmediato.
  - `/_astro/*` lleva `public, max-age=31536000, immutable`. Astro pone un hash en el nombre de esos archivos, así que pueden quedar en caché un año.

### Antes de empezar

- Node.js 24 LTS y las dependencias instaladas (`npm ci`).
- Acceso al proyecto de Google Cloud de Yamaha con permisos de Firebase (rol Propietario o Administrador de Firebase).
- El backend ya desplegado en Cloud Run (spec M7, pasos 1 a 5; ver `yamaha-consent-api/README.md`) y su URL a mano.
- El dominio final definido (⚠️ PENDIENTE-15) y acceso al panel de Hostinger donde se administra su DNS.
- La URL de la política de privacidad (⚠️ PENDIENTE-14).

### 1. Configuración inicial (una sola vez)

```powershell
# 1.1 Instalar la CLI e iniciar sesión (abre el navegador)
npm install -g firebase-tools
firebase login

# 1.2 Agregar Firebase al proyecto de Google Cloud (si aún no lo tiene)
firebase projects:addfirebase <ID_PROYECTO>

# 1.3 Seleccionar el proyecto (crea .firebaserc con el alias "prod")
firebase use <ID_PROYECTO> --alias prod

# 1.4 Crear el sitio y asignarlo al target "landing" de firebase.json
firebase hosting:sites:create consent-landing
firebase target:apply hosting landing consent-landing
```

- Si PowerShell bloquea el script de la CLI ("firebase.ps1 no se puede cargar"), usa `firebase.cmd` en lugar de `firebase`, o `npx firebase-tools`.
- El paso 1.2 también se puede hacer en la consola: https://console.firebase.google.com → **Agregar proyecto** → elegir el proyecto de Google Cloud existente.
- El ID del sitio es **único en todo Firebase**. Si `consent-landing` ya está tomado, usa otro (por ejemplo `yamaha-consent-landing`) en los dos comandos de 1.4. El ID solo se ve en la URL técnica `https://<ID_SITIO>.web.app`; el cliente usa el dominio propio.
- `.firebaserc` guarda el proyecto y la asignación del target. No tiene secretos: versiónalo para no repetir este paso.

### 2. Variables de Producción

```powershell
Copy-Item .env.production.example .env.production   # bash: cp .env.production.example .env.production
```

Completa `.env.production` (está en `.gitignore`):

| Variable | Valor |
|---|---|
| `PUBLIC_API_BASE_URL` | URL de Cloud Run, con `https` y sin barra final: `gcloud run services describe consent-api --region=<REGION> --format="value(status.url)"` |
| `PUBLIC_PRIVACY_POLICY_URL` | URL de la política de privacidad. Debe ser **la misma** que `PRIVACY_POLICY_URL` del backend, que es la que se guarda en la evidencia |

Mientras exista `.env.production`, todo `npm run build` usa esos valores, también un `npm run preview` local. Ese preview llamaría a la API de Producción y CORS lo bloquearía. Para trabajar en local usa `npm run dev`.

### 3. Build y verificación

```powershell
npm ci
npm run test:e2e        # opcional: pruebas e2e (no tocan dist/)
npm run build           # astro check + build a dist/ con .env.production

# La URL de la API publicada debe ser la de Cloud Run, nunca localhost:
Select-String -Path dist\index.html -Pattern "run.app" -Quiet       # debe decir True
Select-String -Path dist\index.html -Pattern "localhost" -Quiet     # debe decir False
```

### 4. Desplegar

```powershell
firebase deploy --only hosting
```

Al terminar, la CLI muestra la URL técnica del sitio (`https://<ID_SITIO>.web.app`). La landing ya carga ahí, pero todavía no puede llamar a la API: CORS solo permite el dominio final (paso 6).

Antes de publicar, puedes revisar la versión en un canal temporal con `firebase hosting:channel:deploy revision --expires 2d`. Sirve para revisar la parte visual; las llamadas a la API fallarán por CORS.

### 5. Conectar el dominio personalizado (DNS en Hostinger)

1. **En Firebase:** https://console.firebase.google.com → el proyecto → **Hosting** → sitio `consent-landing` → **Agregar dominio personalizado**.
   - Escribe el dominio final, por ejemplo `consentimiento.<dominio>`.
   - No marques la redirección a otro dominio.
   - Firebase muestra los registros DNS que necesita: un **TXT** de verificación y uno o más registros **A** con sus IP. A veces agrega un registro para el certificado (`_acme-challenge`). Copia los valores **tal cual los muestre Firebase**.
2. **En Hostinger:** hPanel → **Dominios** → el dominio → **DNS / Nameservers** → **Registros DNS**.
   - **Borra** los registros A, AAAA o CNAME que ya existan **con el mismo nombre**. Hostinger suele crear algunos por defecto, que apuntan a su hosting o a una página de estacionamiento. Un AAAA que apunte a otro lado impide emitir el certificado.
   - Agrega los registros que pidió Firebase. En **Nombre** va solo la parte del subdominio (`consentimiento`; Hostinger completa el dominio) o `@` si es el dominio raíz. Usa un TTL bajo (300 s) mientras dure la configuración.
   - Si el dominio tiene registros **CAA**, deben autorizar a `letsencrypt.org` y `pki.goog`. Si no hay CAA, no hagas nada.
   - Esto aplica si el dominio usa los nameservers de Hostinger. Si el DNS está en otro proveedor, los registros van allí.
3. **Esperar la verificación.** Firebase verifica el dominio y emite el certificado SSL automáticamente. Suele tardar minutos, pero puede llevar hasta 24 h por la propagación del DNS. Para ver qué ya está publicado:

   ```powershell
   nslookup -type=TXT consentimiento.<dominio>
   nslookup -type=A consentimiento.<dominio>
   ```

   El dominio queda listo cuando la consola de Firebase lo muestra como **Conectado**.

### 6. Ajustar el backend al dominio final

Este es el paso 8 de M7, en `yamaha-consent-api`. En `deploy/cloudrun.env.yaml`, cambia `CORS_ALLOWED_ORIGINS` y `LANDING_BASE_URL` a `https://consentimiento.<dominio>`, sin barra final, y vuelve a desplegar Cloud Run como indica su README. Sin esto, la landing muestra "No pudimos conectar..." y los enlaces de WhatsApp apuntarían a otro dominio.

El botón de la plantilla de WhatsApp usa un dominio fijo (PENDIENTE-15). Por eso este dominio debe estar definido antes de crear la plantilla en Twilio.

### 7. Verificar (criterios de M7)

```powershell
curl.exe -sI https://consentimiento.<dominio>/                 # 200 con Referrer-Policy: no-referrer, Strict-Transport-Security, X-Frame-Options
curl.exe -sI https://consentimiento.<dominio>/gracias          # 200
curl.exe -sI https://consentimiento.<dominio>/enlace-invalido  # 200
```

- Abre `https://consentimiento.<dominio>/?t=prueba` en el navegador. Debe redirigir a `/enlace-invalido?motivo=invalido`, lo que confirma que la landing llega a la API y que CORS está bien. Si muestra "No pudimos conectar...", revisa `PUBLIC_API_BASE_URL` (paso 2) y `CORS_ALLOWED_ORIGINS` (paso 6).
- Lighthouse en móvil (Chrome DevTools → Lighthouse → Mobile) con Performance y Accessibility ≥ 90.
- El flujo completo con un token real (solo llega por WhatsApp) se prueba en M8.

### Actualizaciones y reversión

- **Nueva versión:** pasos 3 y 4 (`npm run build` y `firebase deploy --only hosting`). La configuración inicial y el dominio no se repiten.
- **Volver a una versión anterior:** consola de Firebase → **Hosting** → sitio → **Historial de versiones** → en la versión deseada, **Revertir**.
