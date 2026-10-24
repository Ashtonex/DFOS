"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import * as repo from "@/data/repository";
import { errorMessage } from "@/data/errors";
import { availableClientFunds, totalsList, type CurrencyTotals } from "@/domain/finance";
import { DISBURSEMENT_CATEGORY_LABEL } from "@/domain/labels";
import { formatBasisPoints, formatMoney, toMajorInput } from "@/domain/money";
import { todayISO, addDaysISO } from "@/domain/rules";
import { CURRENCIES, DISBURSEMENT_CATEGORIES, type Currency, type DisbursementCategory, type PaymentNotification, type Receipt } from "@/domain/types";
import type { ShipmentDetail } from "@/data/repository";
import { useAction, useViewer } from "@/lib/hooks";
import { canWrite } from "@/lib/persona";
import { TOPICS } from "@/lib/queryKeys";
import { ActionDialog, requireAmount } from "../forms";
import { NotificationStatus } from "../client/ClientPayments";
import { FundingBadge, Money } from "../status";
import { useToast } from "../toast";
import { Badge, Button, Card, CardHeader, EmptyState, SelectField, TableWrap, TextAreaField, TextField, formatDate, td, th } from "../ui";

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

export function FinanceSummaryCards({ totals }: { totals: CurrencyTotals[] }) {
  if (totals.length === 0) return <p className="p-4 text-sm text-slate-500">No financial records yet.</p>;
  return (
    <div className="divide-y divide-slate-100">
      {totals.map((t) => (
        <div key={t.currency} className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2" data-testid={`finance-summary-${t.currency}`}>
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Client money · {t.currency} (pass-through, not revenue)</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Fig label="Funding requested" v={t.fundingRequested} c={t.currency} id="requested" />
              <Fig label="Notified, unverified" v={t.notifiedUnverified} c={t.currency} id="notified" hint="Not available funds" />
              <Fig label="Verified receipts" v={t.verifiedClientFunds} c={t.currency} id="verified" />
              <Fig label="Disbursed" v={t.disbursed} c={t.currency} id="disbursed" />
              <Fig label="Client funds held" v={t.clientFundsHeld} c={t.currency} id="held" />
              <Fig label="Unrecovered disbursements" v={t.unrecoveredDisbursements} c={t.currency} id="unrecovered" alert />
              <Fig label="Funding outstanding" v={t.fundingOutstanding} c={t.currency} id="outstanding" />
            </dl>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Service & illustrative contribution · {t.currency}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Fig label="Service invoiced" v={t.serviceInvoiced} c={t.currency} id="invoiced" />
              <Fig label="Invoice paid" v={t.servicePaid} c={t.currency} id="paid" />
              <Fig label="Invoice outstanding" v={t.invoiceOutstanding} c={t.currency} id="invoice-outstanding" />
              <Fig label="Operational costs" v={t.operationalCosts} c={t.currency} id="costs" />
              <Fig label="Contribution" v={t.contribution} c={t.currency} id="contribution" />
              <div>
                <dt className="text-xs text-slate-500">Margin</dt>
                <dd className="tabular font-medium" data-testid={`fig-${t.currency}-margin`}>
                  {formatBasisPoints(t.marginBp)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">Illustrative operational calculation (service invoiced − own operational costs), not statutory accounting.</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Fig({ label, v, c, id, hint, alert }: { label: string; v: number; c: Currency; id: string; hint?: string; alert?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`font-medium ${alert && v > 0 ? "text-red-700" : ""}`} data-testid={`fig-${c}-${id}`}>
        <Money minor={v} currency={c} />
      </dd>
      {hint && <dd className="text-[11px] text-slate-400">{hint}</dd>}
    </div>
  );
}

export function FinanceTab({ d }: { d: ShipmentDetail }) {
  const { persona } = useViewer();
  const toast = useToast();
  const sid = d.shipment.id;
  const writable = canWrite(persona) && d.shipment.stage !== "closed";
  const totals = totalsList(d.row.finance);
  const [dialog, setDialog] = useState<
    | null
    | { kind: "funding" }
    | { kind: "cancel"; id: string }
    | { kind: "verify"; n: PaymentNotification }
    | { kind: "unmatched"; n: PaymentNotification }
    | { kind: "reverse"; r: Receipt }
    | { kind: "disburse" }
    | { kind: "line" }
    | { kind: "cost" }
  >(null);
  const close = () => setDialog(null);

  const createFunding = useAction((u, a: { input: repo.FundingRequestInput; opId: string }) => repo.createFundingRequest(u, a.input, a.opId), TOPICS.finance, sid);
  const cancelFunding = useAction((u, a: { id: string; reason: string }) => repo.cancelFundingRequest(u, a.id, a.reason), TOPICS.finance, sid);
  const verify = useAction((u, a: { id: string; input: repo.VerifyInput; opId: string }) => repo.verifyPayment(u, a.id, a.input, a.opId), TOPICS.finance, sid);
  const unmatched = useAction((u, a: { id: string; reason: string }) => repo.rejectNotification(u, a.id, a.reason), TOPICS.finance, sid);
  const reverse = useAction((u, a: { id: string; reason: string }) => repo.reverseReceipt(u, a.id, a.reason), TOPICS.finance, sid);
  const disburse = useAction((u, a: { input: repo.DisbursementInput; opId: string }) => repo.recordDisbursement(u, a.input, a.opId), TOPICS.finance, sid);
  const addLine = useAction((u, a: { input: repo.InvoiceLineInput; opId: string }) => repo.addInvoiceLine(u, a.input, a.opId), TOPICS.finance, sid);
  const removeLine = useAction((u, id: string) => repo.removeInvoiceLine(u, id), TOPICS.finance, sid);
  const issue = useAction((u, id: string) => repo.issueInvoice(u, id), TOPICS.finance, sid);
  const addCost = useAction((u, a: { input: repo.CostInput; opId: string }) => repo.addOperationalCost(u, a.input, a.opId), TOPICS.finance, sid);

  const draft = d.invoices.find((i) => i.invoice.status === "draft");
  const invoiceCurrency: Currency = d.invoices[0]?.invoice.currency ?? "USD";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Financial summary" description="Derived from stored funding requests, verified receipts, disbursements, invoices and costs. Currencies are never combined." />
        <FinanceSummaryCards totals={totals} />
      </Card>

      <Card>
        <CardHeader
          title="Funding requests"
          actions={
            writable && (
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "funding" })} data-testid="new-funding">
                <Plus className="size-3.5" aria-hidden /> Request funding
              </Button>
            )
          }
        />
        {d.fundingRequests.length === 0 ? (
          <EmptyState title="No funding requested." />
        ) : (
          <TableWrap label="Funding requests">
            <thead>
              <tr>
                <th className={th}>Purpose</th>
                <th className={th}>Amount</th>
                <th className={th}>Verified</th>
                <th className={th}>Due</th>
                <th className={th}>Status</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {d.fundingRequests.map(({ request: f, status, verified }) => (
                <tr key={f.id} data-testid="funding-row">
                  <td className={td}>{f.purpose}</td>
                  <td className={td}><Money minor={f.amount} currency={f.currency} /></td>
                  <td className={td}><Money minor={verified} currency={f.currency} /></td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(f.dueDate)}</td>
                  <td className={td}><FundingBadge status={status} /></td>
                  <td className={td}>
                    {writable && status === "awaiting_payment" && (
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "cancel", id: f.id })}>
                        Withdraw
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader title="Client payment notifications" description="A notification is the client's claim of payment. Verify against the bank statement before funds become available." />
        {d.notifications.length === 0 ? (
          <EmptyState title="No payment notifications." />
        ) : (
          <TableWrap label="Payment notifications">
            <thead>
              <tr>
                <th className={th}>Notified</th>
                <th className={th}>For</th>
                <th className={th}>Client ref</th>
                <th className={th}>Paid on</th>
                <th className={th}>Status</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {d.notifications.map((n) => (
                <tr key={n.id} data-testid="notification-row">
                  <td className={td}><Money minor={n.amount} currency={n.currency} /></td>
                  <td className={td}>
                    {n.target.kind === "invoice"
                      ? `Invoice ${d.invoices.find((i) => n.target.kind === "invoice" && i.invoice.id === n.target.invoiceId)?.invoice.number ?? ""}`
                      : d.fundingRequests.find((f) => n.target.kind === "funding_request" && f.request.id === n.target.fundingRequestId)?.request.purpose}
                  </td>
                  <td className={td}>{n.payerReference}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(n.paidOn)}</td>
                  <td className={td}><NotificationStatus n={n} /></td>
                  <td className={td}>
                    {writable && n.status === "notified" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setDialog({ kind: "verify", n })} data-testid="verify-payment">
                          Verify receipt
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "unmatched", n })}>
                          Not matched
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader title="Verified receipts" />
        {d.receipts.length === 0 ? (
          <EmptyState title="No verified receipts." />
        ) : (
          <TableWrap label="Verified receipts">
            <thead>
              <tr>
                <th className={th}>Amount</th>
                <th className={th}>Allocated to</th>
                <th className={th}>Bank ref</th>
                <th className={th}>Received</th>
                <th className={th}>Status</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {d.receipts.map((r) => (
                <tr key={r.id} data-testid="receipt-row" className={r.reversed ? "text-slate-400 line-through decoration-slate-300" : ""}>
                  <td className={td}><Money minor={r.amount} currency={r.currency} /></td>
                  <td className={td}>{r.allocation.kind === "invoice" ? "Service invoice" : "Client funds"}</td>
                  <td className={td}>{r.bankReference}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(r.receivedOn)}</td>
                  <td className={td}>{r.reversed ? <Badge tone="danger">Reversed: {r.reversalReason}</Badge> : <Badge tone="success">Verified</Badge>}</td>
                  <td className={td}>
                    {writable && !r.reversed && (
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "reverse", r })}>
                        Reverse
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Disbursements"
          description="Payments made on the client's behalf from client funds held."
          actions={
            writable && (
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "disburse" })} data-testid="new-disbursement">
                <Plus className="size-3.5" aria-hidden /> Record disbursement
              </Button>
            )
          }
        />
        {d.disbursements.length === 0 ? (
          <EmptyState title="No disbursements recorded." />
        ) : (
          <TableWrap label="Disbursements">
            <thead>
              <tr>
                <th className={th}>Amount</th>
                <th className={th}>Category</th>
                <th className={th}>Payee</th>
                <th className={th}>Paid</th>
                <th className={th}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {d.disbursements.map((x) => (
                <tr key={x.id} data-testid="disbursement-row">
                  <td className={td}>
                    <Money minor={x.amount} currency={x.currency} />
                    {x.prefunded && (
                      <Badge tone="warning" className="ml-1">
                        Pre-funded
                      </Badge>
                    )}
                  </td>
                  <td className={td}>{DISBURSEMENT_CATEGORY_LABEL[x.category]}</td>
                  <td className={td}>
                    {x.payee}
                    {x.prefundReason && <span className="block text-xs text-amber-800">{x.prefundReason}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(x.paidOn)}</td>
                  <td className={td}>{x.reference}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Service invoice"
          description="Divine Freight's own fees (revenue). Disbursements are never invoiced as revenue."
          actions={
            writable &&
            !d.invoices.some((i) => i.invoice.status === "issued") && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "line" })} data-testid="add-invoice-line">
                  <Plus className="size-3.5" aria-hidden /> Add service line
                </Button>
                {draft && draft.lines.length > 0 && (
                  <Button
                    size="sm"
                    pending={issue.isPending}
                    data-testid="issue-invoice"
                    onClick={async () => {
                      try {
                        await issue.mutateAsync(draft.invoice.id);
                        toast("success", `Invoice ${draft.invoice.number} issued.`);
                      } catch (e) {
                        toast("danger", errorMessage(e));
                      }
                    }}
                  >
                    Issue invoice
                  </Button>
                )}
              </>
            )
          }
        />
        {d.invoices.length === 0 ? (
          <EmptyState title="No invoice drafted." />
        ) : (
          d.invoices.map(({ invoice, lines, total }) => (
            <div key={invoice.id} className="p-4 text-sm" data-testid="invoice">
              <div className="mb-2 flex flex-wrap items-center gap-2 font-medium">
                {invoice.number}
                <Badge tone={invoice.status === "issued" ? "success" : "neutral"}>{invoice.status === "issued" ? `Issued ${formatDate(invoice.issuedAt)}` : "Draft"}</Badge>
              </div>
              <ul className="divide-y divide-slate-100 rounded border border-slate-200">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span>{l.description}</span>
                    <span className="flex items-center gap-2">
                      <Money minor={l.amount} currency={invoice.currency} />
                      {writable && invoice.status === "draft" && (
                        <button
                          type="button"
                          className="rounded px-1.5 text-xs text-red-700 hover:bg-red-50"
                          aria-label={`Remove ${l.description}`}
                          onClick={() => removeLine.mutateAsync(l.id).catch((e) => toast("danger", errorMessage(e)))}
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </li>
                ))}
                <li className="flex justify-between bg-slate-50 px-3 py-1.5 font-medium">
                  <span>Total</span>
                  <Money minor={total} currency={invoice.currency} />
                </li>
              </ul>
            </div>
          ))
        )}
      </Card>

      <Card>
        <CardHeader
          title="Operational costs (internal)"
          description="Divine Freight's own cost of handling this file. Never shown to the client."
          actions={
            canWrite(persona) && (
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "cost" })} data-testid="add-cost">
                <Plus className="size-3.5" aria-hidden /> Add cost
              </Button>
            )
          }
        />
        {d.costs.length === 0 ? (
          <EmptyState title="No operational costs recorded." />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {d.costs.map((c) => (
              <li key={c.id} className="flex justify-between px-4 py-2">
                <span>
                  {c.description} · {formatDate(c.incurredOn)}
                </span>
                <Money minor={c.amount} currency={c.currency} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------------------- dialogs */}
      <ActionDialog
        open={dialog?.kind === "funding"}
        onClose={close}
        title="Request funding from client"
        submitLabel="Send funding request"
        testId="funding-form"
        initial={{ purpose: "", amount: "", currency: "USD" as Currency, dueDate: addDaysISO(todayISO(), 3) }}
        success="Funding request sent to the client."
        run={(v, opId) => createFunding.mutateAsync({ input: { shipmentId: sid, purpose: v.purpose, amount: requireAmount(v.amount), currency: v.currency, dueDate: v.dueDate }, opId })}
        render={(v, set, e) => (
          <>
            <TextField label="Purpose" required value={v.purpose} onChange={(x) => set({ purpose: x.target.value })} error={e.purpose} placeholder="e.g. Customs duty and VAT" />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Amount" inputMode="decimal" required value={v.amount} onChange={(x) => set({ amount: x.target.value })} error={e.amount} data-testid="funding-amount" />
              <SelectField label="Currency" value={v.currency} onChange={(x) => set({ currency: x.target.value as Currency })} options={currencyOptions} />
            </div>
            <TextField label="Due date" type="date" required value={v.dueDate} onChange={(x) => set({ dueDate: x.target.value })} error={e.dueDate} />
          </>
        )}
      />
      <ActionDialog
        open={dialog?.kind === "cancel"}
        onClose={close}
        title="Withdraw funding request"
        submitLabel="Withdraw"
        danger
        initial={{ reason: "" }}
        success="Funding request withdrawn."
        run={(v) => cancelFunding.mutateAsync({ id: (dialog as { id: string }).id, reason: v.reason })}
        render={(v, set, e) => <TextAreaField label="Reason" required value={v.reason} onChange={(x) => set({ reason: x.target.value })} error={e.reason} />}
      />
      {dialog?.kind === "verify" && (
        <ActionDialog
          open
          onClose={close}
          title="Verify receipt against bank statement"
          submitLabel="Record verified receipt"
          testId="verify-form"
          initial={{ amount: toMajorInput(dialog.n.amount), bankReference: "", receivedOn: todayISO() }}
          success="Receipt verified. Funds are now available."
          run={(v, opId) =>
            verify.mutateAsync({ id: dialog.n.id, input: { amountReceived: requireAmount(v.amount, "amountReceived"), bankReference: v.bankReference, receivedOn: v.receivedOn }, opId })
          }
          render={(v, set, e) => (
            <>
              <p className="text-sm text-slate-700">
                Client notified <strong>{formatMoney(dialog.n.amount, dialog.n.currency)}</strong> (ref {dialog.n.payerReference}, paid {formatDate(dialog.n.paidOn)}). Record what actually arrived.
              </p>
              <TextField label={`Amount received (${dialog.n.currency})`} inputMode="decimal" required value={v.amount} onChange={(x) => set({ amount: x.target.value })} error={e.amountReceived} />
              <TextField label="Bank statement reference" required value={v.bankReference} onChange={(x) => set({ bankReference: x.target.value })} error={e.bankReference} data-testid="verify-bank-ref" />
              <TextField label="Date received" type="date" required max={todayISO()} value={v.receivedOn} onChange={(x) => set({ receivedOn: x.target.value })} error={e.receivedOn} />
            </>
          )}
        />
      )}
      {dialog?.kind === "unmatched" && (
        <ActionDialog
          open
          onClose={close}
          title="Payment not matched"
          submitLabel="Mark not matched"
          danger
          initial={{ reason: "" }}
          success="Client informed that the payment could not be matched."
          run={(v) => unmatched.mutateAsync({ id: dialog.n.id, reason: v.reason })}
          render={(v, set, e) => <TextAreaField label="Reason (shown to the client)" required value={v.reason} onChange={(x) => set({ reason: x.target.value })} error={e.reason} />}
        />
      )}
      {dialog?.kind === "reverse" && (
        <ActionDialog
          open
          onClose={close}
          title={`Reverse receipt ${dialog.r.bankReference}`}
          submitLabel="Reverse receipt"
          danger
          initial={{ reason: "" }}
          success="Receipt reversed."
          run={(v) => reverse.mutateAsync({ id: dialog.r.id, reason: v.reason })}
          render={(v, set, e) => (
            <>
              <p className="text-sm">Reversal excludes {formatMoney(dialog.r.amount, dialog.r.currency)} from all totals. The record is kept for audit. Supervisor only.</p>
              <TextAreaField label="Reason" required value={v.reason} onChange={(x) => set({ reason: x.target.value })} error={e.reason} />
            </>
          )}
        />
      )}
      <ActionDialog
        open={dialog?.kind === "disburse"}
        onClose={close}
        title="Record disbursement"
        submitLabel="Record disbursement"
        testId="disbursement-form"
        initial={{ category: "duty" as DisbursementCategory, payee: "", amount: "", currency: "USD" as Currency, paidOn: todayISO(), reference: "", prefundReason: "" }}
        success="Disbursement recorded."
        run={(v, opId) =>
          disburse.mutateAsync({
            input: { shipmentId: sid, category: v.category, payee: v.payee, amount: requireAmount(v.amount), currency: v.currency, paidOn: v.paidOn, reference: v.reference, prefundReason: v.prefundReason },
            opId,
          })
        }
        render={(v, set, e) => (
          <>
            <p className="rounded bg-slate-50 px-3 py-2 text-sm" data-testid="available-funds">
              Client funds available: <strong>{formatMoney(availableClientFunds(d.row.finance, v.currency), v.currency)}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Category" value={v.category} onChange={(x) => set({ category: x.target.value as DisbursementCategory })} options={DISBURSEMENT_CATEGORIES.map((c) => ({ value: c, label: DISBURSEMENT_CATEGORY_LABEL[c] }))} />
              <SelectField label="Currency" value={v.currency} onChange={(x) => set({ currency: x.target.value as Currency })} options={currencyOptions} />
            </div>
            <TextField label="Payee" required value={v.payee} onChange={(x) => set({ payee: x.target.value })} error={e.payee} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Amount" inputMode="decimal" required value={v.amount} onChange={(x) => set({ amount: x.target.value })} error={e.amount} data-testid="disbursement-amount" />
              <TextField label="Paid on" type="date" required max={todayISO()} value={v.paidOn} onChange={(x) => set({ paidOn: x.target.value })} error={e.paidOn} />
            </div>
            <TextField label="Payment reference" required value={v.reference} onChange={(x) => set({ reference: x.target.value })} error={e.reference} />
            <TextAreaField
              label="Pre-funding reason (supervisor only)"
              hint="Only needed when paying more than the client funds held. The shortfall becomes an unrecovered disbursement."
              value={v.prefundReason}
              onChange={(x) => set({ prefundReason: x.target.value })}
              error={e.prefundReason}
            />
          </>
        )}
      />
      <ActionDialog
        open={dialog?.kind === "line"}
        onClose={close}
        title="Add service invoice line"
        submitLabel="Add line"
        testId="line-form"
        initial={{ description: "Clearance service fee", amount: "" }}
        success="Invoice line added."
        run={(v, opId) => addLine.mutateAsync({ input: { shipmentId: sid, description: v.description, amount: requireAmount(v.amount), currency: invoiceCurrency }, opId })}
        render={(v, set, e) => (
          <>
            <TextField label="Description" required value={v.description} onChange={(x) => set({ description: x.target.value })} error={e.description} />
            <TextField label={`Amount (${invoiceCurrency})`} inputMode="decimal" required value={v.amount} onChange={(x) => set({ amount: x.target.value })} error={e.amount} data-testid="line-amount" />
          </>
        )}
      />
      <ActionDialog
        open={dialog?.kind === "cost"}
        onClose={close}
        title="Add operational cost"
        submitLabel="Add cost"
        initial={{ description: "", amount: "", incurredOn: todayISO() }}
        success="Operational cost recorded."
        run={(v, opId) => addCost.mutateAsync({ input: { shipmentId: sid, description: v.description, amount: requireAmount(v.amount), currency: "USD", incurredOn: v.incurredOn }, opId })}
        render={(v, set, e) => (
          <>
            <TextField label="Description" required value={v.description} onChange={(x) => set({ description: x.target.value })} error={e.description} />
            <TextField label="Amount (USD)" inputMode="decimal" required value={v.amount} onChange={(x) => set({ amount: x.target.value })} error={e.amount} />
            <TextField label="Date" type="date" required value={v.incurredOn} onChange={(x) => set({ incurredOn: x.target.value })} error={e.incurredOn} />
          </>
        )}
      />
    </div>
  );
}
