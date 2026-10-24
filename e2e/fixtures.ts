import { test as base, expect, type Page } from "@playwright/test";

/** Collects console errors and uncaught exceptions / unhandled rejections for every test. */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
    });
    await use(errors);
  },
});

export { expect };

/** Marks the current document so later checks can prove it was not replaced. */
export async function markDocument(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__dfosDocMarker = Math.random().toString(36).slice(2);
    w.__navbar = document.querySelector('[data-testid="shell-navbar"]');
    w.__sidebar = document.querySelector('[data-testid="shell-sidebar"]');
  });
  return page.evaluate(() => (window as unknown as Record<string, string>).__dfosDocMarker);
}

export async function shellIdentity(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return {
      marker: (w.__dfosDocMarker as string | undefined) ?? null,
      navbarSame: w.__navbar === document.querySelector('[data-testid="shell-navbar"]') && !!w.__navbar,
      sidebarSame: w.__sidebar === document.querySelector('[data-testid="shell-sidebar"]') && !!w.__sidebar,
      navigationEntries: performance.getEntriesByType("navigation").length,
    };
  });
}

export async function setPersona(page: Page, personaId: string) {
  await page.getByTestId("persona-switcher").selectOption(personaId);
}

/** Waits until the seeded demo data has loaded in the operations list. */
export async function waitForRows(page: Page) {
  await expect(page.getByTestId("shipment-row").first()).toBeVisible();
}

export async function readMeta(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open("dfos-demo");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("meta", "readonly");
          const g = tx.objectStore("meta").get("seed");
          g.onsuccess = () => {
            resolve(g.result);
            db.close();
          };
          g.onerror = () => reject(g.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}
