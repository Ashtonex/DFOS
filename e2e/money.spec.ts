// Slice 3: exceptions, follow-ups and money.
import { expect, setPersona, test } from "./fixtures";

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test.describe("Slice 3 — exceptions and money", () => {
  test("M-01 external delay: validation, exception + follow-up task, queue visibility, resolution", async ({ page, errors }) => {
    await page.goto("/operations/shipments/shp-0103?tab=tasks");
    await page.getByTestId("record-exception").click();
    await page.getByTestId("exception-form-submit").click();
    await expect(page.getByTestId("exception-form").getByText("Description is required.")).toBeVisible();
    await page.getByLabel("External authority / party").fill("Customs processing — Forbes");
    await page.getByTestId("exception-description").fill("Entry queried pending tariff classification");
    await page.getByTestId("exception-next").fill("Send supplier datasheet to classification desk");
    await page.getByTestId("exception-form-submit").dblclick();
    await expect(page.getByTestId("exception-item").filter({ hasText: "tariff classification" })).toHaveCount(1);
    await expect(page.getByTestId("exception-item").first()).toContainText("Manually recorded");
    await expect(page.getByTestId("task-item").filter({ hasText: "Send supplier datasheet" })).toHaveCount(1);
    await expect(page.getByTestId("task-item").filter({ hasText: "Send supplier datasheet" }).getByRole("button", { name: "Complete" })).toHaveCount(0);

    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Exceptions" }).click();
    await page.getByRole("button", { name: /External delays/ }).click();
    await expect(page.getByTestId("exceptions-list")).toContainText("DF-2026-0103");

    await page.goto("/operations/shipments/shp-0103?tab=tasks");
    await page.getByTestId("exception-item").filter({ hasText: "tariff classification" }).getByTestId("resolve-exception").click();
    await page.getByTestId("resolution").fill("Classification accepted (manually recorded).");
    await page.getByTestId("resolve-form-submit").click();
    await expect(page.getByTestId("exception-item").filter({ hasText: "tariff classification" })).toContainText("Resolved");
    await expect(page.getByTestId("task-item").filter({ hasText: "Send supplier datasheet" })).toContainText("Done");
    expect(errors).toEqual([]);
  });

  test("M-02 funding → client notification (not funds) → single verified receipt → client sees confirmation", async ({ page, errors }) => {
    // client notifies against DF-2026-0103's USD 6,800.00 request
    await page.goto("/operations");
    await setPersona(page, "client-kap");
    await page.goto("/client/shipments/shp-0103?tab=payments");
    await page.getByTestId("notify-payment").click();
    await page.getByTestId("notify-amount").fill("12.345");
    await page.getByTestId("notify-ref").fill("KAP-EFT-55120");
    await page.getByTestId("confirm-notify").click();
    await expect(page.getByText("Use at most two decimal places.")).toBeVisible();
    await page.getByTestId("notify-amount").fill("6,800.00");
    // proof of payment: a text file is refused, a screenshot is accepted
    await page.getByTestId("notify-pop").setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("paid") });
    await page.getByTestId("confirm-notify").click();
    await expect(page.getByTestId("notify-pop-error")).toContainText("PDF, PNG or JPEG");
    await page.getByTestId("notify-pop").setInputFiles({ name: "eft-screenshot.png", mimeType: "image/png", buffer: Buffer.from(PNG_1PX, "base64") });
    await page.getByTestId("confirm-notify").click();
    await expect(page.getByTestId("client-notifications")).toContainText("Awaiting verification");
    await expect(page.getByTestId("client-funding-row")).toContainText("Payment notified — unverified");

    await setPersona(page, "ops");
    await page.goto("/operations/shipments/shp-0103?tab=finance");
    await expect(page.getByTestId("fig-USD-notified")).toHaveText("USD 6,800.00");
    await expect(page.getByTestId("fig-USD-verified")).toHaveText("USD 0.00");
    await expect(page.getByTestId("fig-USD-held")).toHaveText("USD 0.00");
    // finance can open the client's proof while verifying; it is evidence, not funds
    await page.getByTestId("notification-row").getByTestId("view-pop").click();
    await expect(page.getByTestId("document-viewer")).toContainText("image/png");
    await expect(page.getByRole("img", { name: "eft-screenshot.png" })).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByTestId("verify-payment").click();
    await page.getByTestId("verify-bank-ref").fill("BNK-0103-7781");
    await page.getByTestId("verify-form-submit").dblclick();
    await expect(page.getByTestId("receipt-row")).toHaveCount(1);
    await expect(page.getByTestId("fig-USD-verified")).toHaveText("USD 6,800.00");
    await expect(page.getByTestId("fig-USD-notified")).toHaveText("USD 0.00");
    await expect(page.getByTestId("fig-USD-held")).toHaveText("USD 6,800.00");
    await expect(page.getByTestId("funding-row")).toContainText("Funded");
    await expect(page.getByTestId("verify-payment")).toHaveCount(0);

    await setPersona(page, "client-kap");
    await page.goto("/client/shipments/shp-0103?tab=payments");
    await expect(page.getByTestId("client-notifications")).toContainText("Verified by finance");
    await expect(page.getByTestId("client-statement-USD")).toContainText("USD 6,800.00");
    expect(errors).toEqual([]);
  });

  test("M-03 disbursements: blocked beyond funds with useful error; recorded within funds; pre-funding creates unrecovered", async ({ page, errors }) => {
    // DF-2026-0101 has no verified funds
    await page.goto("/operations/shipments/shp-0101?tab=finance");
    await page.getByTestId("new-disbursement").click();
    await expect(page.getByTestId("available-funds")).toContainText("USD 0.00");
    await page.getByLabel("Payee").fill("Customs duty (demo)");
    await page.getByTestId("disbursement-amount").fill("150");
    await page.getByLabel("Payment reference").fill("PAY-0101-1");
    await page.getByTestId("disbursement-form-submit").click();
    await expect(page.getByTestId("disbursement-form")).toContainText("Exceeds verified client funds available (USD 0.00)");
    await expect(page.getByTestId("disbursement-row")).toHaveCount(0);
    await page.getByLabel("Pre-funding reason (supervisor only)").fill("Release before weekend to avoid demurrage.");
    await page.getByTestId("disbursement-form-submit").click();
    await expect(page.getByTestId("disbursement-row")).toHaveCount(1);
    await expect(page.getByTestId("disbursement-row")).toContainText("Pre-funded");
    await expect(page.getByTestId("fig-USD-unrecovered")).toHaveText("USD 150.00");

    // the dashboard / KPI reflects it without reload
    await page.getByTestId("shell-sidebar").getByRole("link", { name: "Funding & finance" }).click();
    await expect(page.getByText("DF-2026-0101").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("M-04 service invoice: draft lines, issue, client sees issued invoice only", async ({ page, errors }) => {
    await page.goto("/operations/shipments/shp-0105?tab=finance"); // no invoice yet
    await page.getByTestId("add-invoice-line").click();
    await page.getByTestId("line-amount").fill("0");
    await page.getByTestId("line-form-submit").click();
    await expect(page.getByTestId("line-form")).toContainText("Amount must be greater than zero.");
    await page.getByTestId("line-amount").fill("820.00");
    await page.getByTestId("line-form-submit").click();
    await expect(page.getByTestId("invoice")).toContainText("Draft");

    await setPersona(page, "client-zmd");
    await page.goto("/client/shipments/shp-0105?tab=payments");
    await expect(page.getByText("No invoice issued yet.")).toBeVisible();

    await setPersona(page, "ops");
    await page.goto("/operations/shipments/shp-0105?tab=finance");
    await page.getByTestId("issue-invoice").click();
    await expect(page.getByTestId("invoice")).toContainText("Issued");
    await expect(page.getByTestId("fig-USD-invoiced")).toHaveText("USD 820.00");

    await setPersona(page, "client-zmd");
    await page.goto("/client/shipments/shp-0105?tab=payments");
    await expect(page.getByTestId("client-invoice")).toContainText("USD 820.00");
    expect(errors).toEqual([]);
  });
});
