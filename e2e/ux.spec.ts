// Slice 5: responsive layout and accessibility checks across every main route.
import type { Page } from "@playwright/test";
import { expect, setPersona, test } from "./fixtures";

const ROUTES: Record<string, string[]> = {
  ops: [
    "/",
    "/operations",
    "/operations/shipments",
    "/operations/shipments/shp-0102",
    "/operations/shipments/shp-0102?tab=documents",
    "/operations/shipments/shp-0102?tab=milestones",
    "/operations/shipments/shp-0102?tab=tasks",
    "/operations/shipments/shp-0104?tab=finance",
    "/operations/shipments/shp-0102?tab=activity",
    "/operations/documents",
    "/operations/exceptions",
    "/operations/finance",
    "/operations/tasks",
    "/guide",
    "/settings",
  ],
  mgmt: ["/management", "/management/shipments?kpi=unrecovered", "/management/exceptions", "/management/finance", "/management/performance"],
  "client-ehis": [
    "/client",
    "/client/shipments",
    "/client/shipments/new",
    "/client/shipments/shp-0101",
    "/client/shipments/shp-0101?tab=documents",
    "/client/shipments/shp-0102?tab=payments",
    "/client/requests",
    "/client/documents",
  ],
};

async function checkPage(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Loading/ })).toHaveCount(0);
  const r = await page.evaluate(() => {
    const unlabeled = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("main input, main select, main textarea, header input, header select")]
      .filter((el) => el.type !== "hidden" && !(el.labels && el.labels.length) && !el.getAttribute("aria-label"))
      .map((el) => el.outerHTML.slice(0, 80));
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      h1: document.querySelectorAll("main h1").length,
      unlabeled,
    };
  });
  expect(r.overflow, `horizontal page overflow on ${url}`).toBeLessThanOrEqual(0);
  expect(r.h1, `h1 count on ${url}`).toBe(1);
  expect(r.unlabeled, `unlabelled fields on ${url}`).toEqual([]);
}

for (const viewport of [
  { name: "mobile 360", width: 360, height: 780 },
  { name: "desktop 1280", width: 1280, height: 800 },
]) {
  test(`R-01 ${viewport.name}: every main route renders without horizontal overflow, with one h1 and labelled fields`, async ({ page, errors }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/operations");
    for (const [persona, urls] of Object.entries(ROUTES)) {
      await setPersona(page, persona);
      for (const url of urls) await checkPage(page, url);
    }
    expect(errors).toEqual([]);
  });
}

test("R-02 mobile navigation drawer opens, navigates client-side and closes; Escape closes it", async ({ page, errors }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/operations");
  await expect(page.getByTestId("shell-sidebar")).toBeHidden();
  await page.getByTestId("mobile-nav-button").click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Shipments" }).click();
  await expect(page).toHaveURL(/\/operations\/shipments$/);
  await expect(drawer).toBeHidden();
  await page.getByTestId("mobile-nav-button").click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  expect(errors).toEqual([]);
});

test("R-03 forms work at 360px (client request submitted from a phone-sized viewport)", async ({ page, errors }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/operations");
  await setPersona(page, "client-zmd");
  await page.goto("/client/shipments/new");
  await page.getByLabel("Goods description").fill("Ultrasound probes (mobile test)");
  await page.getByLabel("Origin").fill("Johannesburg");
  await page.getByLabel("Destination").fill("Harare");
  await page.getByLabel("Border / processing location").fill("Beitbridge");
  await page.getByTestId("submit-request").click();
  await expect(page.getByTestId("detail-description")).toHaveText("Ultrasound probes (mobile test)");
  expect(errors).toEqual([]);
});

test("A-01 dialogs are keyboard operable with focus trapped and restored", async ({ page, errors }) => {
  await page.goto("/operations/shipments/shp-0103?tab=tasks");
  const trigger = page.getByTestId("record-exception");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Record exception" });
  await expect(dialog).toBeVisible();
  // focus is inside the dialog and stays there while tabbing
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test("A-02 status is conveyed in text, not colour alone; skip-free keyboard focus is visible", async ({ page, errors }) => {
  await page.goto("/operations/shipments");
  await expect(page.getByTestId("shipment-row").first()).toBeVisible();
  // badges carry words such as "Overdue", "Unassigned", "Docs complete"
  await expect(page.getByTestId("shipment-row").filter({ hasText: "Unassigned" })).toHaveCount(1);
  await expect(page.getByTestId("shipment-row").filter({ hasText: "overdue" }).first()).toBeVisible();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe("none");
  expect(errors).toEqual([]);
});
