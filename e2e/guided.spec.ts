// Slice 5: the complete guided demonstration, driven only through the UI and the guide's own "Go" buttons.
import type { Page } from "@playwright/test";
import { expect, setPersona, test } from "./fixtures";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

async function uploadInto(page: Page, scope: ReturnType<Page["locator"]> | Page, name: string) {
  await scope.getByTestId(name.startsWith("attach") ? name : "upload-requirement").click();
  await page.getByTestId("upload-input").setInputFiles({ name: "document.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByTestId("confirm-upload").click();
  await expect(page.getByTestId("upload-input")).toHaveCount(0);
}

async function goStep(page: Page, key: string) {
  await page.getByTestId("shell-sidebar").getByRole("link", { name: "Demo guide" }).click();
  await page.getByTestId(`guide-step-${key}`).getByRole("button", { name: "Go" }).click();
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Shipment sections" }).getByRole("link", { name, exact: true });

async function advance(page: Page, label: string) {
  await tab(page, "Overview").click();
  await expect(page.getByTestId("advance-stage")).toHaveText(new RegExp(`Move to ${label}`));
  await page.getByTestId("advance-stage").click();
  await expect(page.getByTestId("detail-reference").locator("..")).toContainText(label);
}

test("G-01 guided demonstration DF-DEMO-2026-001 completes end-to-end without developer intervention", async ({ page, errors }) => {
  test.setTimeout(240_000);
  await page.goto("/guide");
  await expect(page.getByTestId("guide-step-request")).toHaveAttribute("data-done", "false");

  // 1 client request
  await page.getByTestId("guide-step-request").getByRole("button", { name: "Go" }).click();
  await expect(page).toHaveURL(/\/client\/shipments\/new$/);
  await page.getByTestId("fill-guided").click();
  await page.getByTestId("submit-request").click();
  await expect(page.getByTestId("detail-reference")).toHaveText("DF-DEMO-2026-001");

  // 2 operations sees it, assigns officer, moves to preparation
  await goStep(page, "assign");
  await expect(page.getByTestId("detail-reference")).toHaveText("DF-DEMO-2026-001");
  await page.getByTestId("officer-select").selectOption("u-tendai");
  await page.getByTestId("assign-officer").click();
  await advance(page, "Preparation");

  // 3 outstanding documents identified
  await tab(page, "Documents").click();
  await expect(page.getByTestId("requirement").filter({ hasText: "Missing" })).toHaveCount(5);

  // 4 client uploads
  await goStep(page, "clientUpload");
  for (let i = 0; i < 5; i++) await uploadInto(page, page.getByTestId("requirement").filter({ hasText: "Missing" }).first(), "upload");
  await expect(page.getByTestId("requirement").filter({ hasText: "Under review" })).toHaveCount(5);

  // 5 operations rejects one (history kept), client re-uploads, operations accepts all
  await goStep(page, "review");
  const coo = page.locator('[data-requirement="certificate_of_origin"]');
  await coo.getByTestId("reject-document").click();
  await page.getByTestId("reject-reason").fill("Certificate is unsigned. Please upload the signed copy.");
  await page.getByTestId("confirm-reject").click();
  await expect(coo).toContainText("Rejected — resubmit");
  for (let i = 0; i < 4; i++) {
    await page.getByTestId("accept-document").first().click();
    await expect(page.getByTestId("accept-document")).toHaveCount(3 - i);
  }
  await setPersona(page, "client-ehis");
  await page.goto("/client/shipments");
  await page.getByRole("link", { name: "DF-DEMO-2026-001" }).click();
  await tab(page, "Documents").click();
  await expect(page.locator('[data-requirement="certificate_of_origin"]').getByTestId("rejection-reason")).toContainText("unsigned");
  await uploadInto(page, page.locator('[data-requirement="certificate_of_origin"]'), "upload");
  await goStep(page, "review");
  await page.locator('[data-requirement="certificate_of_origin"]').getByTestId("accept-document").click();
  await expect(page.getByTestId("shipment-detail")).toContainText("Docs complete 5/5");

  // 6 ready for submission, then submitted with a reference
  await advance(page, "Ready for submission");
  await expect(page.getByTestId("advance-stage")).toBeDisabled();
  await page.getByTestId("submission-ref").fill("BB-SUB-DEMO-0001");
  await page.getByTestId("advance-stage").click();
  await expect(page.getByTestId("detail-reference").locator("..")).toContainText("Submitted");

  // 7 external delay
  await goStep(page, "delay");
  await page.getByTestId("record-exception").click();
  await page.getByLabel("External authority / party").fill("Customs processing — Beitbridge");
  await page.getByTestId("exception-description").fill("Consignment selected for physical inspection");
  await page.getByTestId("exception-next").fill("Confirm inspection slot with the examination desk");
  await page.getByTestId("exception-form-submit").click();
  await expect(page.getByTestId("exception-item")).toHaveCount(1);

  // 8 management sees it
  await goStep(page, "management");
  await expect(page.getByTestId("exceptions-list")).toContainText("DF-DEMO-2026-001");

  // 9 funding request
  await goStep(page, "funding");
  await page.getByTestId("new-funding").click();
  await page.getByLabel("Purpose").fill("Customs duty and VAT");
  await page.getByTestId("funding-amount").fill("2,500.00");
  await page.getByTestId("funding-form-submit").click();
  await expect(page.getByTestId("funding-row")).toContainText("Awaiting payment");

  // 10 client notifies payment
  await goStep(page, "notify");
  await page.getByTestId("notify-payment").click();
  await expect(page.getByTestId("notify-amount")).toHaveValue("2500.00");
  await page.getByTestId("notify-ref").fill("EHIS-EFT-90210");
  await page.getByTestId("confirm-notify").click();
  await expect(page.getByTestId("client-notifications")).toContainText("Awaiting verification");

  // 11 verify actual receipt
  await goStep(page, "verify");
  await expect(page.getByTestId("fig-USD-notified")).toHaveText("USD 2,500.00");
  await expect(page.getByTestId("fig-USD-verified")).toHaveText("USD 0.00");
  await page.getByTestId("verify-payment").click();
  await page.getByTestId("verify-bank-ref").fill("BNK-DEMO-0001");
  await page.getByTestId("verify-form-submit").click();
  await expect(page.getByTestId("fig-USD-held")).toHaveText("USD 2,500.00");

  // 12 disbursement
  await page.getByTestId("new-disbursement").click();
  await page.getByLabel("Payee").fill("Customs duty and VAT (demo)");
  await page.getByTestId("disbursement-amount").fill("2500");
  await page.getByLabel("Payment reference").fill("PAY-DEMO-0001");
  await page.getByTestId("disbursement-form-submit").click();
  await expect(page.getByTestId("fig-USD-held")).toHaveText("USD 0.00");
  await expect(page.getByTestId("fig-USD-disbursed")).toHaveText("USD 2,500.00");

  // 13 release evidence, released, in delivery
  await tab(page, "Documents").click();
  await uploadInto(page, page, "attach-release_evidence");
  await advance(page, "Released");
  await advance(page, "In delivery");

  // 14 proof of delivery, delivered
  await tab(page, "Documents").click();
  await uploadInto(page, page, "attach-proof_of_delivery");
  await advance(page, "Delivered");

  // closure is blocked until requirements are met
  await expect(page.getByTestId("blockers")).toContainText("1 exception(s) still open.");
  await expect(page.getByTestId("blockers")).toContainText("Service invoice has not been issued.");
  await expect(page.getByTestId("advance-stage")).toBeDisabled();

  // 15 invoice + financial summary; client pays; operations verifies
  await tab(page, "Finance").click();
  await page.getByTestId("add-invoice-line").click();
  await page.getByTestId("line-amount").fill("750");
  await page.getByTestId("line-form-submit").click();
  await page.getByTestId("issue-invoice").click();
  await expect(page.getByTestId("fig-USD-invoiced")).toHaveText("USD 750.00");
  await setPersona(page, "client-ehis");
  await page.goto("/client/shipments");
  await page.getByRole("link", { name: "DF-DEMO-2026-001" }).click();
  await tab(page, "Funding & payments").click();
  await page.getByTestId("notify-invoice-payment").click();
  await page.getByTestId("notify-ref").fill("EHIS-EFT-90211");
  await page.getByTestId("confirm-notify").click();
  await goStep(page, "invoice");
  await page.getByTestId("verify-payment").click();
  await page.getByTestId("verify-bank-ref").fill("BNK-DEMO-0002");
  await page.getByTestId("verify-form-submit").click();
  await expect(page.getByTestId("fig-USD-invoice-outstanding")).toHaveText("USD 0.00");
  await expect(page.getByTestId("fig-USD-contribution")).toHaveText("USD 750.00");

  // 16 resolve exception, close
  await tab(page, "Tasks & exceptions").click();
  await page.getByTestId("resolve-exception").click();
  await page.getByTestId("resolution").fill("Inspection completed; entry released (manually recorded).");
  await page.getByTestId("resolve-form-submit").click();
  await advance(page, "Closed");
  await expect(page.getByText("File closed")).toBeVisible();

  // the guide derives completion from stored records
  await page.getByTestId("shell-sidebar").getByRole("link", { name: "Demo guide" }).click();
  for (const step of await page.getByTestId("guide-steps").locator("li").all()) await expect(step).toHaveAttribute("data-done", "true");

  // client sees the full, client-safe story
  await setPersona(page, "client-ehis");
  await page.goto("/client/shipments?show=closed");
  await page.getByRole("link", { name: "DF-DEMO-2026-001" }).click();
  await expect(page.getByTestId("progress-tracker")).toContainText("File closed");
  await expect(page.getByTestId("client-activity")).toContainText("External processing delay recorded");
  await expect(page.getByTestId("client-activity")).not.toContainText("physical inspection");
  expect(errors).toEqual([]);
});

test("G-02 reset restores the presentation state and the scenario is repeatable", async ({ page, errors }) => {
  await page.goto("/operations");
  await setPersona(page, "client-ehis");
  await page.goto("/client/shipments/new");
  await page.getByTestId("fill-guided").click();
  await page.getByTestId("submit-request").click();
  await expect(page.getByTestId("detail-reference")).toHaveText("DF-DEMO-2026-001");
  // creating it again is refused with guidance
  await page.goto("/client/shipments/new");
  await page.getByTestId("fill-guided").click();
  await page.getByTestId("submit-request").click();
  await expect(page.getByTestId("request-form").getByRole("alert")).toContainText("guided demo shipment already exists");

  // the form still holds unsaved values, so leaving must warn first
  const warned = page.waitForEvent("dialog").then(async (d) => {
    expect(d.message()).toContain("unsaved changes");
    await d.accept();
  });
  await page.getByTestId("shell-sidebar").getByRole("link", { name: "Settings & demo data" }).click();
  await warned;
  await page.getByTestId("reset-demo").click();
  await expect(page.getByRole("dialog")).toContainText("Reset demonstration data?");
  await page.getByTestId("confirm-reset").click();
  await expect(page.getByText("Demonstration data restored to its starting state.")).toBeVisible();

  await page.getByTestId("shell-sidebar").getByRole("link", { name: "Demo guide" }).click();
  await expect(page.getByTestId("guide-step-request")).toHaveAttribute("data-done", "false");
  await setPersona(page, "ops");
  await page.goto("/operations/shipments");
  await expect(page.getByTestId("result-count")).toHaveText("14 files");
  await page.reload();
  await expect(page.getByTestId("result-count")).toHaveText("14 files");
  expect(errors).toEqual([]);
});
