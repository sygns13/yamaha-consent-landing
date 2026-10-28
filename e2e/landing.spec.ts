import { expect, test, type Page } from "@playwright/test";
import { E2E_PRIVACY_POLICY_URL, TOKEN, linkInfo, mockApi, submitted } from "./mock-api";

const NETWORK_ERROR_TEXT = "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.";

function checkboxes(page: Page) {
  return [
    page.getByRole("checkbox", { name: /^Acepto la política de privacidad/ }),
    page.getByRole("checkbox", { name: /^Autorizo a YAMAHA/ }),
    page.getByRole("checkbox", { name: /^Autorizo al DEALER/ }),
  ];
}

async function openValidLink(page: Page): Promise<void> {
  await page.goto(`/?t=${TOKEN}`);
  await expect(page.getByRole("button", { name: "ENVIAR" })).toBeVisible();
}

async function expectThanksPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/gracias\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¡Gracias por tu respuesta!");
}

test.describe("link válido", () => {
  test("con los tres checks marcados envía true en los tres y lleva a /gracias", async ({ page }) => {
    const api = await mockApi(page, { submit: [submitted("ACEPTADO")] });
    await openValidLink(page);

    // privacy_policy_url viene null: se usa la URL de build (TODO(PENDIENTE-14)).
    for (const link of await page.getByRole("link", { name: /política de privacidad/ }).all()) {
      await expect(link).toHaveAttribute("href", E2E_PRIVACY_POLICY_URL);
      await expect(link).toHaveAttribute("target", "_blank");
    }
    for (const checkbox of checkboxes(page)) {
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
    }
    await page.getByRole("button", { name: "ENVIAR" }).click();

    await expectThanksPage(page);
    expect(api.submits).toEqual([{ personal_data: true, marketing_yamaha: true, marketing_dealer: true }]);
  });

  test("RN-01: con todos los checks desmarcados se puede enviar, manda false en los tres y lleva a /gracias", async ({
    page,
  }) => {
    const api = await mockApi(page, { submit: [submitted("NO_ACEPTADO")] });
    await openValidLink(page);

    for (const checkbox of checkboxes(page)) await expect(checkbox).not.toBeChecked();
    // Siempre habilitado, sin validaciones ni diálogos de confirmación.
    await expect(page.getByRole("button", { name: "ENVIAR" })).toBeEnabled();
    page.on("dialog", (dialog) => {
      throw new Error(`Diálogo inesperado: ${dialog.message()}`);
    });
    await page.getByRole("button", { name: "ENVIAR" }).click();

    await expectThanksPage(page);
    expect(api.submits).toEqual([{ personal_data: false, marketing_yamaha: false, marketing_dealer: false }]);
  });
});

test.describe("link no disponible", () => {
  test("vencido lleva a /enlace-invalido?motivo=vencido", async ({ page }) => {
    const api = await mockApi(page, { link: [linkInfo("EXPIRED")] });
    await page.goto(`/?t=${TOKEN}`);

    await expect(page).toHaveURL(/\/enlace-invalido\/?\?motivo=vencido$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este enlace ya no está disponible");
    await expect(page.getByText("El enlace ha vencido")).toBeVisible();
    expect(api.submits).toEqual([]);
  });

  test("usado lleva a /enlace-invalido?motivo=usado", async ({ page }) => {
    const api = await mockApi(page, { link: [linkInfo("USED")] });
    await page.goto(`/?t=${TOKEN}`);

    await expect(page).toHaveURL(/\/enlace-invalido\/?\?motivo=usado$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este enlace ya no está disponible");
    await expect(page.getByText("Ya registraste tus respuestas anteriormente")).toBeVisible();
    expect(api.submits).toEqual([]);
  });

  test("sin token lleva a /enlace-invalido?motivo=invalido sin llamar a la API", async ({ page }) => {
    const api = await mockApi(page, {});
    await page.goto("/");

    await expect(page).toHaveURL(/\/enlace-invalido\/?\?motivo=invalido$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este enlace ya no está disponible");
    await expect(page.getByText("El enlace ha vencido")).toBeHidden();
    await expect(page.getByText("Ya registraste tus respuestas anteriormente")).toBeHidden();
    expect(api.linkCalls()).toBe(0);
  });
});

test.describe("error de red con reintento", () => {
  test("si falla la validación del link, Reintentar muestra el formulario", async ({ page }) => {
    const api = await mockApi(page, { link: ["network-error", linkInfo("VALID")] });
    await page.goto(`/?t=${TOKEN}`);

    // Se queda en la página (el link puede estar bien) y no muestra el formulario.
    const loadError = page.locator("#load-error");
    await expect(loadError).toBeVisible();
    await expect(loadError).toContainText(NETWORK_ERROR_TEXT);
    await expect(page).toHaveURL(new RegExp(`\\?t=${TOKEN}$`));
    await expect(page.getByRole("button", { name: "ENVIAR" })).toBeHidden();

    await page.getByRole("button", { name: "Reintentar" }).click();

    await expect(page.getByRole("button", { name: "ENVIAR" })).toBeVisible();
    await expect(loadError).toBeHidden();
    expect(api.linkCalls()).toBe(2);
  });

  test("si falla el envío, conserva el token y lo marcado, y el reintento lleva a /gracias", async ({ page }) => {
    const api = await mockApi(page, { submit: ["network-error", submitted("ACEPTADO")] });
    await openValidLink(page);
    const [personalData] = checkboxes(page);
    await personalData!.check();
    await page.getByRole("button", { name: "ENVIAR" }).click();

    const submitError = page.locator("#submit-error");
    await expect(submitError).toBeVisible();
    await expect(submitError).toContainText(NETWORK_ERROR_TEXT);
    // El token sigue en la URL (una recarga vuelve a validar el link) y el formulario queda como estaba.
    await expect(page).toHaveURL(new RegExp(`\\?t=${TOKEN}$`));
    await expect(personalData!).toBeChecked();
    await expect(page.getByRole("button", { name: "ENVIAR" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "ENVIAR" })).toBeFocused();

    await page.getByRole("button", { name: "ENVIAR" }).click();

    await expectThanksPage(page);
    const answers = { personal_data: true, marketing_yamaha: false, marketing_dealer: false };
    expect(api.submits).toEqual([answers, answers]);
  });
});

test("doble clic en ENVIAR envía una sola vez", async ({ page }) => {
  // La respuesta del envío se retiene hasta terminar los clics, como con una red lenta.
  let releaseSubmit!: () => void;
  const submitHeld = new Promise<void>((resolve) => (releaseSubmit = resolve));
  const api = await mockApi(page, { beforeSubmitResponse: () => submitHeld });
  await openValidLink(page);

  await page.getByRole("button", { name: "ENVIAR" }).dblclick();

  // Mientras espera: botón deshabilitado con "Enviando..." y checks bloqueados.
  const button = page.locator("#submit-button");
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleName("Enviando...");
  for (const checkbox of checkboxes(page)) await expect(checkbox).toBeDisabled();
  // Un envío por teclado (Enter) también se ignora mientras hay uno en curso.
  await page.locator("#consent-form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect(api.submits).toHaveLength(1);

  releaseSubmit();

  await expectThanksPage(page);
  expect(api.submits).toHaveLength(1);
});
