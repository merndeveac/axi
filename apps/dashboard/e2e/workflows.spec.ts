import { test, expect } from "./fixtures/test";
import { navigateSecondary, openV2 } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openV2(page);
});

test("primary workflow surfaces use deterministic browser fixtures", async ({
  page
}) => {
  await page.getByRole("tab", { name: "Positions" }).click();
  await expect(
    page.getByRole("heading", { name: "Paper positions", level: 1 })
  ).toBeVisible();
  await expect(page.getByText("Paper only", { exact: true }).first()).toBeVisible();
  await expect(page).toHaveScreenshot("positions.png");

  await page.getByRole("tab", { name: "Research" }).click();
  await expect(
    page.getByRole("heading", { name: "Token research", level: 1 })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Price and volume" })).toBeVisible();
  await expect(page).toHaveScreenshot("research.png");
});

test("secondary workflow surfaces retain the compact global header", async ({
  page
}) => {
  await navigateSecondary(page, "Strategy & Evidence");
  await expect(
    page.getByRole("heading", { name: "Strategy & Evidence", level: 1 })
  ).toBeVisible();
  await expect(page.getByText("No live promotion", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("strategy-evidence.png");

  await navigateSecondary(page, "Runtime");
  await expect(
    page.getByRole("heading", { name: "Runtime", level: 1 })
  ).toBeVisible();
  await expect(page.getByLabel("Runtime safety boundary")).toContainText(
    "Private keys: safe"
  );
  await expect(page).toHaveScreenshot("runtime.png");

  await navigateSecondary(page, "Settings");
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 })
  ).toBeVisible();
  await expect(page.getByText("No secrets or execution controls.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Arm/i })).toHaveCount(1);
  await expect(page).toHaveScreenshot("settings.png");
});

test("bounded metered-data acknowledgement is mocked and process-owned", async ({
  page,
  mockApi
}) => {
  const armButton = page.getByRole("button", { name: "Arm", exact: true });
  await armButton.click();
  const dialog = page.getByRole("dialog", {
    name: "Arm bounded metered data"
  });
  await expect(dialog).toBeVisible();
  const submit = dialog.getByRole("button", { name: "Acknowledge and arm" });
  await expect(submit).toBeDisabled();

  await dialog.getByLabel("Maximum session SOL").fill("0.1");
  await expect(dialog.getByRole("alert")).toContainText(
    "Values must be positive"
  );
  await dialog.getByLabel("Maximum session SOL").fill("0.0001");
  await dialog.getByRole("checkbox").check();
  await expect(submit).toBeEnabled();
  await expect(page).toHaveScreenshot("arm-bounded-metered-data.png");
  await submit.click();

  await expect(dialog).toBeHidden();
  const startButton = page.getByRole("button", { name: "Start", exact: true });
  await expect(startButton).toBeEnabled();
  await expect(startButton).toBeFocused();
  const armRequest = mockApi.requests.find(
    (request) =>
      request.method === "POST" &&
      request.path === "/runtime/metered-launch-data/ack-session"
  );
  expect(armRequest?.body).toEqual({
    ackCost: true,
    maxSessionCostSol: 0.0001,
    maxConcurrentMints: 3,
    maxEventsPerSession: 1_000,
    startAfterAck: false
  });
  expect(
    mockApi.requests.some(
      (request) => request.path === "/runtime/metered-launch-data/start"
    )
  ).toBe(false);
});

test("diagnostic resources fail independently and the drawer restores focus", async ({
  page,
  mockApi
}) => {
  mockApi.fail("/indexer/status");
  const menuButton = page.getByRole("button", {
    name: "Open secondary navigation"
  });
  await menuButton.click();
  await page.getByRole("menuitem", { name: "Developer diagnostics" }).click();

  const drawer = page.getByRole("dialog", { name: "Developer diagnostics" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".axi-v2-diagnostic-panel")).toHaveCount(9);
  await drawer.locator('[data-panel="indexer-status"] summary').click();
  await expect(drawer.getByText("Indexer status unavailable")).toBeVisible();
  await expect(drawer.getByText("Discovery coverage")).toBeVisible();
  await expect(page).toHaveScreenshot("developer-diagnostics.png");

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menuButton).toBeFocused();
  await expect(page.getByRole("heading", { name: "Momentum scanner" })).toBeVisible();
});

test("token-detail failure stays isolated in the responsive research drawer", async ({
  page,
  mockApi
}) => {
  const card = page.getByTestId("scanner-card").first();
  const mint = await card.getAttribute("data-mint");
  expect(mint).not.toBeNull();
  mockApi.fail(`/ui/v2/scanner/${mint}`);
  await card.click();

  const drawer = page.getByRole("dialog", { name: "Research · AXIF" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Rich token detail unavailable")).toBeVisible();
  await expect(drawer.getByText("The scanner remains live.")).toBeVisible();
  await expect(page).toHaveScreenshot("token-research-drawer-error.png");

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(card).toBeFocused();
  await expect(page.getByText("100 shown · 100 active")).toBeVisible();
});

test("primary navigation follows the tab keyboard contract", async ({ page }) => {
  const scanner = page.getByRole("tab", { name: "Scanner" });
  await scanner.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Positions" })).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Paper positions", level: 1 })
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Research" })).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Token research", level: 1 })
  ).toBeVisible();
});
