// Foundation Gate browser checks FG-01..FG-09 (FG-10 is the production build itself).
import { expect, markDocument, readMeta, shellIdentity, test, waitForRows } from "./fixtures";

test.describe("Foundation Gate", () => {
  test("FG-01/FG-02 shell DOM identity retained and no document replacement across internal navigation", async ({ page, errors }) => {
    await page.goto("/operations");
    await expect(page.getByTestId("kpi-active-value")).toHaveText(/\d+/);
    const marker = await markDocument(page);
    const sidebar = page.getByTestId("shell-sidebar");

    const hops: [string, RegExp][] = [
      ["Shipments", /\/operations\/shipments$/],
      ["Dashboard", /\/operations$/],
      ["Settings & demo data", /\/settings$/],
      ["Shipments", /\/operations\/shipments$/],
    ];
    for (const [label, re] of hops) {
      // Settings is only reachable from the persistent sidebar footer
      await sidebar.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(re);
      const id = await shellIdentity(page);
      expect(id.marker, `document replaced after navigating to ${label}`).toBe(marker);
      expect(id.navbarSame, `navbar node replaced after ${label}`).toBe(true);
      expect(id.sidebarSame, `sidebar node replaced after ${label}`).toBe(true);
      expect(id.navigationEntries).toBe(1);
    }
    // nested detail route via in-page link, then management workspace
    await waitForRows(page);
    await page.getByRole("link", { name: "DF-2026-0102" }).click();
    await expect(page.getByTestId("detail-reference")).toHaveText("DF-2026-0102");
    await page.getByRole("link", { name: "Milestones" }).click();
    await expect(page).toHaveURL(/tab=milestones/);
    const id = await shellIdentity(page);
    expect(id).toEqual({ marker, navbarSame: true, sidebarSame: true, navigationEntries: 1 });
    expect(errors).toEqual([]);
  });

  test("FG-03/FG-04 sidebar preference survives route changes and refresh", async ({ page, errors }) => {
    await page.goto("/operations");
    const toggle = page.getByTestId("sidebar-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const collapsedWidth = await page.getByTestId("shell-sidebar").evaluate((el) => el.getBoundingClientRect().width);
    expect(collapsedWidth).toBeLessThan(80);

    const marker = await markDocument(page);
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Shipments" }).click();
    await expect(page).toHaveURL(/\/operations\/shipments$/);
    expect((await shellIdentity(page)).marker).toBe(marker);
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
    await expect(page.getByTestId("sidebar-toggle")).toHaveAttribute("aria-pressed", "true");

    // FG-04: deliberate refresh creates a new document; preference must be restored
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
    await expect(page.getByTestId("sidebar-toggle")).toHaveAttribute("aria-pressed", "true");
    const widthAfter = await page.getByTestId("shell-sidebar").evaluate((el) => el.getBoundingClientRect().width);
    expect(widthAfter).toBeLessThan(80);

    // and expanding again persists too
    await page.getByTestId("sidebar-toggle").click();
    await page.reload();
    await expect(page.getByTestId("sidebar-toggle")).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });

  test("FG-05/FG-06/FG-09 edit saves, updates list and detail without reload, survives refresh", async ({ page, errors }) => {
    await page.goto("/operations/shipments");
    await waitForRows(page);
    const metaBefore = await readMeta(page);
    const marker = await markDocument(page);
    await page.getByRole("link", { name: "DF-2026-0101" }).click();
    await expect(page.getByTestId("detail-reference")).toHaveText("DF-2026-0101");

    const value = `Conveyor rollers — edited ${Date.now()}`;
    await page.getByTestId("edit-shipment").click();
    const desc = page.getByLabel("Goods description");
    await desc.fill("");
    await desc.pressSequentially(value.slice(0, 12)); // real typing
    await desc.fill(value);
    await page.getByLabel("Internal notes").fill("Edited during FG-05 verification.");

    // validation: clearing a required field shows an inline error and saves nothing
    await page.getByLabel("Origin").fill("");
    await page.getByTestId("save-shipment").click();
    await expect(page.getByText("Origin is required.")).toBeVisible();
    await page.getByLabel("Origin").fill("Durban");

    await page.getByTestId("save-shipment").click();
    await expect(page.getByTestId("shipment-edit-form")).toBeHidden();
    await expect(page.getByTestId("detail-description")).toHaveText(value);

    // list reflects the change via client-side navigation (no reload)
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Shipments" }).click();
    await expect(page).toHaveURL(/\/operations\/shipments$/);
    await expect(page.getByTestId("row-description").filter({ hasText: value })).toHaveCount(1);
    expect((await shellIdentity(page)).marker).toBe(marker);

    // FG-06 refresh: value persists and the database was not reseeded
    await page.reload();
    await expect(page.getByTestId("row-description").filter({ hasText: value })).toHaveCount(1);
    expect(await readMeta(page)).toEqual(metaBefore);
    await page.getByRole("link", { name: "DF-2026-0101" }).click();
    await expect(page.getByTestId("detail-description")).toHaveText(value);
    await expect(page.getByTestId("internal-notes")).toHaveText("Edited during FG-05 verification.");
    expect(errors).toEqual([]);
  });

  test("FG-07 nested routes load directly", async ({ page, errors }) => {
    await page.goto("/operations/shipments/shp-0102?tab=milestones");
    await expect(page.getByTestId("detail-reference")).toHaveText("DF-2026-0102");
    await expect(page.getByRole("link", { name: "Milestones" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("shell-navbar")).toBeVisible();
    await page.goto("/operations/shipments/does-not-exist");
    await expect(page.getByTestId("not-found")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("FG-08 browser back and forward", async ({ page, errors }) => {
    await page.goto("/operations");
    const marker = await markDocument(page);
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Shipments" }).click();
    await waitForRows(page);
    await page.getByRole("link", { name: "DF-2026-0103" }).click();
    await expect(page.getByTestId("detail-reference")).toHaveText("DF-2026-0103");
    await page.getByRole("link", { name: "Activity" }).click();
    await expect(page).toHaveURL(/shp-0103\?tab=activity$/);

    await page.goBack();
    await expect(page).toHaveURL(/shp-0103$/);
    await expect(page.getByTestId("detail-reference")).toHaveText("DF-2026-0103");
    await page.goBack();
    await expect(page).toHaveURL(/\/operations\/shipments$/);
    await waitForRows(page);
    await page.goForward();
    await expect(page.getByTestId("detail-reference")).toHaveText("DF-2026-0103");
    await page.goForward();
    await expect(page).toHaveURL(/tab=activity$/);
    await expect(page.getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
    expect((await shellIdentity(page)).marker).toBe(marker);
    expect(errors).toEqual([]);
  });

  test("FG-09b unsaved-change warning only when edits exist", async ({ page, errors }) => {
    await page.goto("/operations/shipments/shp-0103");
    await page.getByTestId("edit-shipment").click();
    // clean form: navigation proceeds with no dialog
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/operations$/);
    expect(dialogs).toBe(0);

    await page.goBack();
    await page.getByTestId("edit-shipment").click();
    await page.getByLabel("Client reference").fill("KAP-2291-REV");
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Dashboard" }).click();
    expect(dialogs).toBe(1); // dismissed -> stays
    await expect(page).toHaveURL(/shp-0103/);
    await expect(page.getByLabel("Client reference")).toHaveValue("KAP-2291-REV");

    await page.getByTestId("save-shipment").click();
    await expect(page.getByTestId("shipment-edit-form")).toBeHidden();
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/operations$/);
    expect(dialogs).toBe(1); // no warning after a successful save
    expect(errors).toEqual([]);
  });
});
