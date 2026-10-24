// Persistence honesty: without IndexedDB the app shows an actionable error and never falls back to memory.
import { expect, test } from "./fixtures";

test("P-01 unavailable storage produces an actionable error, not silent in-memory data", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
  });
  await page.goto("/operations/shipments");
  await expect(page.getByRole("alert").filter({ hasText: "Could not load this view" })).toContainText("Browser storage (IndexedDB) is unavailable");
  await expect(page.getByRole("alert").filter({ hasText: "Could not load this view" })).toContainText("allow site data for this origin");
  await expect(page.getByTestId("shipment-row")).toHaveCount(0);
  // the shell itself still renders
  await expect(page.getByTestId("shell-navbar")).toBeVisible();
});
