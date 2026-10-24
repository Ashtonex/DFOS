# DFOS — Prototype Business Assumptions

> **These are PROTOTYPE ASSUMPTIONS made for a fictional demonstration. Divine Freight Services has NOT confirmed any of them.**
> Every one must be validated with Divine Freight before real use.
> The same rules drive the repository validation (`src/domain/rules.ts`, `src/data/repository.ts`), the UI feedback (which shows the repository's blocker messages) and the automated tests (`tests/unit/*.test.ts`).

## A1. Required documents

| Category | Required documents (all must be **accepted** before readiness) |
|---|---|
| Import (incl. guided shipment DF-DEMO-2026-001) | Commercial invoice; Packing list; Transport document (bill of lading / road manifest); Certificate of origin; Client authority to act |
| Export | Commercial invoice; Packing list; Client authority to act |
| Transit | Commercial invoice; Transport document; Client authority to act |

- A requirement is **accepted** once any document uploaded against it has been accepted. Otherwise it is *under review* (latest upload pending), *rejected* (latest upload rejected) or *missing*.
- Rejected documents are never deleted. The full upload and review history stays visible.
- A new upload is blocked while another document for the same requirement is awaiting review, and once the requirement is already accepted. This prevents duplicates.
- **Upload limits:** 5 MB maximum. PDF, PNG, JPEG or plain text (.txt) only. The file's content signature must match its extension. HTML and other active content are rejected and never rendered.

## A2. Operational stages and transitions

Stages advance **one step at a time**:

`New request → Preparation → Ready for submission → Submitted → Released → In delivery → Delivered → Closed`

| Move to | Requirement | Overridable? |
|---|---|---|
| Preparation | An officer is assigned | No |
| Ready for submission | Officer assigned; every required document accepted | **Readiness only:** an Operations Supervisor may override, with a recorded reason |
| Submitted | Officer assigned; customs submission reference recorded (manually recorded, not integrated) | No |
| Released | Accepted **release evidence** document attached | No |
| In delivery | Officer assigned | No |
| Delivered | Accepted **proof of delivery** attached | No |
| Closed | All closure criteria (A4) | Only the unpaid service-invoice balance (A5) |
| Reopen (Closed → Delivered) | Operations Supervisor with a reason | n/a |

- Staff upload release evidence and proof of delivery, and these documents are accepted on upload because the uploading officer is the reviewer. Release evidence can be attached from *Submitted* onwards. Proof of delivery can be attached from *Released* onwards.
- Every transition writes a milestone and an audit event. Overrides write an additional `override.used` event.
- Only officers and operations supervisors may move stages. Management is read-only. Clients cannot move stages.

## A3. Blocking tasks and exceptions

- An exception requires a category, an owner (operations staff), a next action and a follow-up date. Recording one also creates a **blocking follow-up task** for the owner.
- A follow-up task linked to an open exception closes only by resolving the exception.
- *External processing delay* exceptions are labelled **Manually recorded**. DFOS does not integrate with customs (e.g. ZIMRA) or any authority. Clients see only a neutral line: "External processing delay recorded. Our team is following up."
- Tasks are *overdue* when open past their due date, measured on the browser's local calendar date.

## A4. Closure criteria (financial reconciliation)

A file can close only when **all** of the following hold:

1. No open blocking tasks.
2. No open exceptions.
3. No client payment notifications still unverified (each must be verified or rejected).
4. A service invoice has been **issued**.
5. **No unrecovered disbursements** in any currency (disbursed ≤ verified client funds).
6. **No client funds still held** in any currency. Surplus funds must be disbursed or refunded to the client first.
7. The service invoice is fully paid. *(Overridable, see A5.)*

## A5. Unpaid service invoices at closure

An unpaid service-invoice balance blocks closure by default. An Operations Supervisor may override it with a reason, for example agreed payment terms. The override is recorded in the audit trail, and the unpaid balance stays visible in finance figures.

## A6. Money

- Amounts are stored as integer minor units with an explicit currency. Seeded data is in USD, and one file includes ZAR port charges to demonstrate currency separation. **Currencies are never aggregated together.**
- A **payment notification** is the client's *claim* that it has paid. It never counts as available funds.
- A **verified receipt** is created only when finance confirms the money arrived (amount received + bank reference + date). The verifier may record a different amount from the one notified. A notification can be verified once only, and each bank reference can be used once only.
- **Client funds held** = verified client-fund receipts − disbursements (per currency, per file). This is client money, **not revenue**.
- **Disbursements** draw on client funds held in the same currency. Paying more than is held is blocked. An Operations Supervisor may **pre-fund** with a recorded reason, and the shortfall becomes an **unrecovered disbursement**. A refund to the client can never exceed the funds held.
- **Corrections:** an Operations Supervisor can reverse a receipt with a reason. Reversed receipts are excluded from all totals and kept for audit.
- **Service invoice** lines are Divine Freight revenue. Disbursements are pass-through and never appear as revenue.
- **Illustrative operational contribution** = issued service invoice total − Divine Freight's own operational costs for the file. Margin is shown to one decimal place, rounded half away from zero. **This is an illustrative operational calculation, not statutory accounting.**

## A7. Permissions (demo personas, not security)

| Persona | Can do |
|---|---|
| Operations: Rudo Chikore, Operations Supervisor | All operational and finance actions, overrides, reopening |
| Management: Tafadzwa Mhlanga | Read-only access to both internal workspaces |
| Client personas (3) | Own records only: request shipments, upload required documents, notify payments, view client-visible progress |

> The demo persona switcher demonstrates experience and filtering. It is not production authentication or a security boundary.

## A8. Reopening

Only an Operations Supervisor can reopen a closed file, which returns it to *Delivered*, and must record a reason. Changes to a closed file are otherwise blocked.
