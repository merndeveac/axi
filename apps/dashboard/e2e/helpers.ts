import { expect, type Page } from "@playwright/test";

export async function openV2(page: Page): Promise<void> {
  await page.goto("/?ui=v2");
  await expect(
    page.getByRole("heading", { name: "Momentum scanner", level: 1 })
  ).toBeVisible();
  await expect(page.getByTestId("scanner-card").first()).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

export async function navigateSecondary(
  page: Page,
  destination: "Strategy & Evidence" | "Runtime" | "Settings"
): Promise<void> {
  await page
    .getByRole("button", { name: "Open secondary navigation" })
    .click();
  await page.getByRole("menuitem", { name: destination }).click();
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);
}
