// Slice 2: shipment workflow (requests, assignment, documents, readiness, transitions, scoping).
import type { Page } from "@playwright/test";
import { expect, setPersona, test } from "./fixtures";

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
);

async function upload(page: Page, name: string, buffer: Buffer, mimeType: string) {
  await page.getByTestId("upload-input").setInputFiles({ name, mimeType, buffer });
  await page.getByTestId("confirm-upload").click();
}

test.describe("Slice 2 — shipment workflow", () => {
  test("W-01 client request: double submit creates one record, persists, appears in Operations", async ({ page, errors }) => {
    await page.goto("/operations");
    await setPersona(page, "client-ehis");
    await expect(page).toHaveURL(/\/client$/);
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "New request" }).click();
    const desc = `Hydraulic hoses ${Date.now()}`;
    await page.getByLabel("Goods description").fill(desc);
    await page.getByLabel("Origin").fill("Durban");
    await page.getByLabel("Destination").fill("Mutare");
    await page.getByLabel("Border / processing location").fill("Beitbridge");
    await page.getByTestId("submit-request").dblclick();
    await expect(page).toHaveURL(/\/client\/shipments\/shp-.+\?tab=documents$/);
    await expect(page.getByTestId("detail-description")).toHaveText(desc);
    await expect(page.getByTestId("requirement")).toHaveCount(5);

    await page.getByTestId("shell-sidebar").getByRole("link", { name: "My shipments" }).click();
    await expect(page.getByTestId("client-shipment-row").filter({ hasText: desc })).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId("client-shipment-row").filter({ hasText: desc })).toHaveCount(1);

    await setPersona(page, "ops");
    await expect(page).toHaveURL(/\/operations$/);
    await page.goto(`/operations/shipments?q=${encodeURIComponent(desc)}`);
    await expect(page.getByTestId("shipment-row")).toHaveCount(1);
    await expect(page.getByTestId("shipment-row")).toContainText("Unassigned");
    await expect(page.getByTestId("shipment-row")).toContainText("New request");
    expect(errors).toEqual([]);
  });

  test("W-02 documents: validation, upload, reopen after refresh, reject with history, accept; client isolation", async ({ page, errors }) => {
    // DF-2026-0101 (EHIS): transport document missing, certificate of origin rejected
    await page.goto("/operations");
    await setPersona(page, "client-ehis");
    await page.goto("/client/shipments/shp-0101?tab=documents");
    const transport = page.locator('[data-requirement="transport_document"]');
    await expect(transport).toContainText("Missing");
    await transport.getByTestId("upload-requirement").click();
    await upload(page, "manifest.pdf", Buffer.from("<html><script>alert(1)</script></html>"), "application/pdf");
    await expect(page.getByTestId("upload-error")).toHaveText("The file content does not match its .pdf extension.");
    await upload(page, "manifest.html", Buffer.from("<html></html>"), "text/html");
    await expect(page.getByTestId("upload-error")).toHaveText("Only PDF, PNG, JPEG or plain-text (.txt) files are accepted.");
    await upload(page, "road-manifest.txt", Buffer.from("ROAD MANIFEST RM-2026-77\nFictional test content <b>not html</b>"), "text/plain");
    await expect(transport).toContainText("Under review");

    const coo = page.locator('[data-requirement="certificate_of_origin"]');
    await expect(coo.getByTestId("rejection-reason")).toContainText("unsigned");
    await coo.getByTestId("upload-requirement").click();
    await upload(page, "coo-signed.pdf", PDF, "application/pdf");
    await expect(coo).toContainText("Under review");

    // reopen the stored file after a refresh; text renders as text, never HTML
    await page.reload();
    await transport.getByRole("button", { name: "View" }).click();
    await expect(page.getByTestId("document-text")).toContainText("ROAD MANIFEST RM-2026-77");
    await expect(page.getByTestId("document-text")).toContainText("<b>not html</b>");
    await page.getByRole("button", { name: "Close dialog" }).click();

    // another client cannot open this file by URL
    await setPersona(page, "client-kap");
    await page.goto("/client/shipments/shp-0101");
    await expect(page.getByTestId("not-found")).toBeVisible();

    // Operations reviews: reject transport (history kept), accept certificate
    await setPersona(page, "ops");
    await page.goto("/operations/shipments/shp-0101?tab=documents");
    const opsTransport = page.locator('[data-requirement="transport_document"]');
    await opsTransport.getByTestId("reject-document").click();
    await page.getByTestId("confirm-reject").click();
    await expect(page.getByText("Give the client a reason for rejecting.")).toBeVisible();
    await page.getByTestId("reject-reason").fill("Manifest is missing the trailer registration.");
    await page.getByTestId("confirm-reject").click();
    await expect(opsTransport).toContainText("Rejected — resubmit");
    const opsCoo = page.locator('[data-requirement="certificate_of_origin"]');
    await opsCoo.getByTestId("accept-document").dblclick();
    await expect(opsCoo).toContainText("Accepted");
    await opsCoo.getByRole("button", { name: /Certificate of origin/ }).click();
    await expect(opsCoo.getByRole("list", { name: /history/ }).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("shipment-detail")).toContainText("Docs 4/5 · 1 rejected");

    // the client sees the reason without reload of shared data
    await setPersona(page, "client-ehis");
    await page.goto("/client/shipments/shp-0101?tab=documents");
    await expect(page.locator('[data-requirement="transport_document"]').getByTestId("rejection-reason")).toContainText("trailer registration");
    expect(errors).toEqual([]);
  });

  test("W-03 transitions: invalid moves blocked with reasons; assignment; supervisor override with audit", async ({ page, errors }) => {
    await page.goto("/operations/shipments/shp-0110"); // new request, unassigned
    await expect(page.getByTestId("blockers")).toContainText("Assign an officer first.");
    await expect(page.getByTestId("advance-stage")).toBeDisabled();
    await page.getByTestId("officer-select").selectOption("u-farai");
    await page.getByTestId("assign-officer").click();
    await expect(page.getByTestId("workflow-panel")).toContainText("All requirements for Preparation are met.");
    await page.getByTestId("advance-stage").click();
    await expect(page.getByTestId("shipment-detail").getByText("Preparation").first()).toBeVisible();
    await expect(page.getByTestId("blockers")).toContainText("Required documents incomplete: 0/5 accepted");

    // DF-2026-0111: preparation with documents under review -> override with reason
    await page.goto("/operations/shipments/shp-0111");
    await expect(page.getByTestId("advance-stage")).toBeDisabled();
    await page.getByTestId("override-toggle").check();
    await expect(page.getByTestId("advance-stage")).toBeDisabled(); // reason required
    await page.getByTestId("override-reason").fill("Originals sighted at supplier; scans to follow.");
    await page.getByTestId("advance-stage").click();
    await expect(page.getByTestId("blockers")).toContainText("Record the customs submission reference.");
    await page.getByRole("link", { name: "Milestones" }).click();
    await expect(page.getByText("Override", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Activity" }).click();
    await expect(page.getByTestId("activity-list")).toContainText("Supervisor override moving to Ready for submission");
    expect(errors).toEqual([]);
  });

  test("W-04 management persona is read-only on operational screens", async ({ page, errors }) => {
    await page.goto("/operations");
    await setPersona(page, "mgmt");
    await page.goto("/operations/shipments/shp-0101");
    await expect(page.getByTestId("detail-reference")).toHaveText("DF-2026-0101");
    await expect(page.getByTestId("edit-shipment")).toHaveCount(0);
    await expect(page.getByTestId("advance-stage")).toHaveCount(0);
    await expect(page.getByText("Read-only view. Stage changes are made by Operations.")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
