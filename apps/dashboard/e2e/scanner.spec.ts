import { test, expect } from "./fixtures/test";
import { expectNoHorizontalOverflow, openV2 } from "./helpers";

const targetViewports = [
  { name: "1280x800", width: 1280, height: 800, completeCards: 6 },
  { name: "1440x900", width: 1440, height: 900, completeCards: 7 },
  { name: "1920x1080", width: 1920, height: 1080, completeCards: 9 }
] as const;

for (const target of targetViewports) {
  test(`scanner meets the ${target.name} density contract`, async ({ page }) => {
    await page.setViewportSize({ width: target.width, height: target.height });
    await openV2(page);

    const metrics = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(
        ".axi-v2-global-header"
      )!;
      const scanner = document.querySelector<HTMLElement>(
        ".axi-v2-scanner-page"
      )!;
      const list = document.querySelector<HTMLElement>(
        ".axi-v2-scanner-list"
      )!;
      const cardElements = [
        ...document.querySelectorAll<HTMLElement>("[data-testid=scanner-card]")
      ];
      const listRect = list.getBoundingClientRect();
      const scannerRect = scanner.getBoundingClientRect();
      const cardRects = cardElements.map((card) => card.getBoundingClientRect());
      return {
        headerHeight: header.getBoundingClientRect().height,
        scannerChromeHeight: listRect.top - scannerRect.top,
        cardHeights: cardRects.map((rect) => rect.height),
        completeCards: cardRects.filter(
          (rect) => rect.top >= listRect.top && rect.bottom <= listRect.bottom
        ).length,
        domCards: cardRects.length,
        listHorizontalOverflow: list.scrollWidth - list.clientWidth
      };
    });

    expect(metrics.headerHeight).toBe(108);
    expect(metrics.scannerChromeHeight).toBe(128);
    expect(new Set(metrics.cardHeights)).toEqual(new Set([82]));
    expect(metrics.completeCards).toBe(target.completeCards);
    expect(metrics.domCards).toBeGreaterThanOrEqual(target.completeCards);
    expect(metrics.domCards).toBeLessThanOrEqual(20);
    expect(metrics.listHorizontalOverflow).toBeLessThanOrEqual(0);
    await expectNoHorizontalOverflow(page);

    await expect(page.getByRole("tab")).toHaveCount(3);
    await expect(page.getByRole("tab", { name: "Scanner" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByText("4.25e-8 SOL").first()).toBeVisible();
    await expect(page).toHaveScreenshot(`scanner-${target.name}.png`);
  });
}

test("scanner controls and selection survive a realtime upsert", async ({
  page,
  mockApi
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openV2(page);
  await expect.poll(() => mockApi.connectedSocketCount).toBe(1);

  const search = page.getByPlaceholder("Search name, symbol, or mint");
  await search.fill("007");
  await expect(page.getByText("1 shown · 100 active")).toBeVisible();
  await search.clear();

  await page.getByLabel("Filter").selectOption("ripping");
  await expect(page.getByText(/shown · 100 active/)).toContainText("8 shown");
  await page.getByLabel("Filter").selectOption("all");
  await page.getByRole("button", { name: "Comfortable" }).click();
  await expect(page.getByTestId("scanner-card").first()).toHaveCSS(
    "height",
    "96px"
  );
  await page.getByRole("button", { name: "Compact" }).click();

  const list = page.getByRole("listbox", { name: "Momentum scanner results" });
  await list.focus();
  await page.keyboard.press("ArrowDown");
  const selected = page.locator('[data-testid="scanner-card"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  const selectedMint = await selected.getAttribute("data-mint");
  expect(selectedMint).not.toBeNull();
  await expect(page.getByLabel(/Research Axi Fixture/)).toBeVisible();

  const selectedRow = mockApi.rows.find((row) => row.mint === selectedMint)!;
  mockApi.sendScannerUpsert({
    ...selectedRow,
    decision: { ...selectedRow.decision, score: 99 }
  });
  await expect(
    page.locator(`[data-mint="${selectedMint}"][aria-selected="true"]`)
  ).toBeVisible();
  await expect(page.getByLabel(/Selected token Axi Fixture/)).toBeVisible();

  await page.getByRole("button", { name: "Close token research" }).click();
  await page.getByRole("button", { name: "Session history" }).click();
  await expect
    .poll(() =>
      mockApi.requests.some((request) =>
        request.path.includes("activeOnly=false")
      )
    )
    .toBe(true);
});
