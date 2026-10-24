// Slice 4: connected workspaces — KPI drill-downs, shared updates, cross-tab, scoping.
import { expect, markDocument, setPersona, shellIdentity, test } from "./fixtures";

const KPIS = ["active", "awaiting_documents", "awaiting_funds", "external_delays", "overdue_followups", "unrecovered", "ready_to_close", "closed"];

test.describe("Slice 4 — connected workspaces", () => {
  test("C-01 every management KPI reconciles with its drill-down (counts and money totals)", async ({ page, errors }) => {
    await page.goto("/operations");
    await setPersona(page, "mgmt");
    await expect(page).toHaveURL(/\/management$/);
    for (const k of KPIS) {
      const tile = page.getByTestId(`mkpi-${k}`);
      const value = Number(await page.getByTestId(`mkpi-${k}-value`).innerText());
      await tile.click();
      await expect(page).toHaveURL(new RegExp(`/management/shipments\\?kpi=${k}$`));
      await expect(page.getByTestId("result-count")).toHaveText(`${value} ${value === 1 ? "file" : "files"}`);
      await expect(page.getByTestId("shipment-row")).toHaveCount(value);
      await page.goBack();
      await expect(page).toHaveURL(/\/management$/);
    }
    // money: unrecovered USD figure equals the drill-down total
    const unrecovered = await page.getByTestId("money-unrecovered-USD-value").innerText();
    await page.getByTestId("money-unrecovered-USD").click();
    await expect(page.getByTestId("result-total-USD")).toContainText(unrecovered);
    await page.goBack();
    const outstanding = await page.getByTestId("money-outstanding-USD-value").innerText();
    await page.getByTestId("money-outstanding-USD").click();
    await expect(page.getByTestId("result-total-USD")).toContainText(outstanding);
    // officer workload link reconciles too
    await page.goBack();
    const firstActive = page.getByTestId("workload-active").first();
    const n = Number(await firstActive.innerText());
    await firstActive.click();
    await expect(page.getByTestId("shipment-row")).toHaveCount(n);
    expect(errors).toEqual([]);
  });

  test("C-02 an Operations change appears in Management without reload (same document)", async ({ page, errors }) => {
    await page.goto("/management");
    await setPersona(page, "ops"); // navigates to /operations
    await page.goto("/management");
    const before = Number(await page.getByTestId("mkpi-external_delays-value").innerText());
    const marker = await markDocument(page);
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Shipments" }).click();
    await page.getByRole("link", { name: "DF-2026-0105" }).click();
    await page.getByRole("link", { name: "Tasks & exceptions" }).click();
    await page.getByTestId("record-exception").click();
    await page.getByTestId("exception-description").fill("Truck held at weighbridge (manually recorded)");
    await page.getByTestId("exception-next").fill("Call transporter dispatcher");
    await page.getByTestId("exception-form-submit").click();
    await expect(page.getByTestId("exception-item").filter({ hasText: "weighbridge" })).toHaveCount(1);
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Overview" }).click();
    await expect(page.getByTestId("mkpi-external_delays-value")).toHaveText(String(before + 1));
    expect((await shellIdentity(page)).marker).toBe(marker);
    expect(errors).toEqual([]);
  });

  test("C-03 same-browser tabs receive updates (BroadcastChannel), without reload", async ({ context, page, errors }) => {
    await page.goto("/operations");
    await setPersona(page, "mgmt");
    await expect(page.getByTestId("mkpi-external_delays-value")).toHaveText(/\d+/);
    const before = Number(await page.getByTestId("mkpi-external_delays-value").innerText());
    const marker = await markDocument(page);

    const other = await context.newPage();
    await other.goto("/operations");
    await setPersona(other, "ops");
    await other.goto("/operations/shipments/shp-0106?tab=tasks");
    await other.getByTestId("record-exception").click();
    await other.getByTestId("exception-description").fill("Cold-store gate closed for audit");
    await other.getByTestId("exception-next").fill("Confirm reopening time");
    await other.getByTestId("exception-form-submit").click();
    await expect(other.getByTestId("exception-item").filter({ hasText: "Cold-store" })).toHaveCount(1);

    // first tab updates via the broadcast invalidation (no focus change, no reload)
    await expect(page.getByTestId("mkpi-external_delays-value")).toHaveText(String(before + 1));
    expect((await shellIdentity(page)).marker).toBe(marker);
    await other.close();
    expect(errors).toEqual([]);
  });

  test("C-04 switching client personas changes visible records; no cross-client leakage in lists, search, documents, routes", async ({ page, errors }) => {
    await page.goto("/operations");
    await setPersona(page, "client-ehis");
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "My shipments" }).click();
    await page.getByRole("button", { name: "all" }).click();
    await expect(page.getByTestId("client-shipment-row")).toHaveCount(5);
    const ehis = await page.getByTestId("client-shipment-row").locator("a").allInnerTexts();
    expect(ehis.sort()).toEqual(["DF-2026-0101", "DF-2026-0102", "DF-2026-0107", "DF-2026-0110", "DF-2026-0113"]);

    await setPersona(page, "client-kap");
    await page.goto("/client/shipments?show=all");
    await expect(page.getByTestId("client-shipment-row")).toHaveCount(5);
    const kap = await page.getByTestId("client-shipment-row").locator("a").allInnerTexts();
    expect(kap.sort()).toEqual(["DF-2026-0103", "DF-2026-0104", "DF-2026-0108", "DF-2026-0111", "DF-2026-0114"]);

    // global search is scoped
    await page.getByTestId("global-search").fill("DF-2026-0101");
    await expect(page.getByRole("listbox", { name: "Search results" })).toContainText("No matching shipments or documents.");
    await page.getByTestId("global-search").fill("DF-2026-0103");
    await expect(page.getByRole("listbox", { name: "Search results" }).getByRole("option").first()).toContainText("DF-2026-0103");
    await page.getByTestId("global-search").press("Escape");

    // documents list is scoped
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Documents" }).click();
    const docRows = page.getByTestId("client-document-row");
    await expect(docRows.first()).toBeVisible();
    for (const t of await docRows.allInnerTexts()) expect(t).toMatch(/DF-2026-01(03|04|08|11|14)/);

    // direct detail URL of another client's file
    await page.goto("/client/shipments/shp-0102");
    await expect(page.getByTestId("not-found")).toBeVisible();
    await expect(page.getByText("Welding consumables")).toHaveCount(0);

    // internal workspaces are not available to client personas
    await page.goto("/operations/shipments/shp-0102");
    await expect(page.getByTestId("workspace-gate")).toBeVisible();
    await expect(page.getByTestId("shipment-detail")).toHaveCount(0);

    // internal notes and internal exception wording never reach the client view
    await setPersona(page, "client-ehis");
    await page.goto("/client/shipments/shp-0101");
    await expect(page.getByTestId("shipment-detail")).toBeVisible();
    await expect(page.getByText("Client prefers updates by phone")).toHaveCount(0);
    await page.goto("/client/shipments/shp-0102");
    await expect(page.getByTestId("client-activity")).toContainText("External processing delay recorded");
    await expect(page.getByText("physical inspection queue")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
