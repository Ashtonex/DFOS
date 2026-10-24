"use client";
import Link from "next/link";
import { useState } from "react";
import { Paperclip, Send } from "lucide-react";
import * as repo from "@/data/repository";
import { DomainError, errorMessage } from "@/data/errors";
import { fundingRequestStatus, totalsList, verifiedForRequest } from "@/domain/finance";
import { DISBURSEMENT_CATEGORY_LABEL } from "@/domain/labels";
import { parseMoney, toMajorInput, formatMoney } from "@/domain/money";
import { POP_TYPES, todayISO } from "@/domain/rules";
import { checkUpload } from "@/domain/files";
import type { Currency, PaymentNotification, ShipmentDocument } from "@/domain/types";
import { DocumentViewer } from "../documents/DocumentViewer";
import type { ShipmentDetail } from "@/data/repository";
import { useDfosMutation, useOpId, useWorkspace } from "@/lib/hooks";
import { TOPICS } from "@/lib/queryKeys";
import { FundingBadge, Money } from "../status";
import { useToast } from "../toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, Modal, PageHeader, TableWrap, TextField, formatDate, td, th } from "../ui";

export type NotifyTarget = {
  target: PaymentNotification["target"];
  shipmentId: string;
  label: string;
  currency: Currency;
  suggested: number;
};

export function NotificationStatus({ n }: { n: PaymentNotification }) {
  if (n.status === "verified") return <Badge tone="success">Verified by finance</Badge>;
  if (n.status === "rejected") return <Badge tone="danger">Not matched</Badge>;
  return <Badge tone="info">Awaiting verification</Badge>;
}

export function NotifyPaymentModal({ t, onClose }: { t: NotifyTarget | null; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pop, setPop] = useState<File | null>(null);
  const [opId, renewOpId] = useOpId();
  const [lastTarget, setLastTarget] = useState<NotifyTarget | null>(null);
  if (t !== lastTarget) {
    setLastTarget(t);
    if (t) {
      setPop(null);
      setAmount(t.suggested > 0 ? toMajorInput(t.suggested) : "");
      setRef("");
      setPaidOn(todayISO());
      setErrors({});
      setFormError(null);
    }
  }
  const notify = useDfosMutation({
    mutationFn: (p, v: { input: repo.NotifyInput; pop?: repo.ProofOfPayment }) => repo.notifyPayment(p.userId, v.input, opId, v.pop),
    topics: TOPICS.finance,
    shipmentId: () => t?.shipmentId,
  });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!t || notify.isPending) return;
    const parsed = parseMoney(amount);
    if (!parsed.ok) return setErrors({ amount: parsed.error });
    let popFile: repo.ProofOfPayment | undefined;
    if (pop) {
      const data = await pop.arrayBuffer();
      const check = checkUpload(pop.name, data);
      const error = !check.ok ? check.error : !POP_TYPES.includes(check.mimeType) ? "Attach a PDF, PNG or JPEG (e.g. a bank confirmation or screenshot)." : null;
      if (error) return setErrors({ pop: error });
      popFile = { fileName: pop.name, data };
    }
    setErrors({});
    setFormError(null);
    try {
      await notify.mutateAsync({ input: { target: t.target, amount: parsed.minor, payerReference: ref, paidOn }, pop: popFile });
      renewOpId();
      toast("success", `Payment notification sent${popFile ? " with proof of payment" : ""}. Divine Freight finance will verify it against the bank statement.`);
      onClose();
    } catch (err) {
      if (err instanceof DomainError && err.fieldErrors) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    }
  };
  return (
    <Modal
      open={!!t}
      onClose={onClose}
      title="Notify a payment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="notify-form" pending={notify.isPending} data-testid="confirm-notify">
            <Send className="size-4" aria-hidden /> Send notification
          </Button>
        </>
      }
    >
      <form id="notify-form" onSubmit={submit} noValidate className="space-y-3">
        <p className="text-sm text-slate-700">
          For: <strong>{t?.label}</strong>
        </p>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <TextField
          label={`Amount paid (${t?.currency})`}
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          data-testid="notify-amount"
        />
        <TextField label="Your payment reference" required value={ref} onChange={(e) => setRef(e.target.value)} error={errors.payerReference} data-testid="notify-ref" />
        <TextField label="Date paid" type="date" required max={todayISO()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} error={errors.paidOn} />
        <div>
          <label htmlFor="notify-pop" className="mb-1 block text-xs font-medium text-slate-700">
            Proof of payment (optional)
          </label>
          <input
            id="notify-pop"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            data-testid="notify-pop"
            aria-invalid={errors.pop ? true : undefined}
            aria-describedby={errors.pop ? "notify-pop-error" : "notify-pop-hint"}
            onChange={(e) => {
              setPop(e.target.files?.[0] ?? null);
              setErrors((prev) => {
                const next = { ...prev };
                delete next.pop;
                return next;
              });
            }}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
          />
          {errors.pop ? (
            <p id="notify-pop-error" className="mt-1 text-xs font-medium text-red-700" data-testid="notify-pop-error">
              {errors.pop}
            </p>
          ) : (
            <p id="notify-pop-hint" className="mt-1 text-xs text-slate-500">
              Bank confirmation PDF or a screenshot (PNG/JPEG), up to 5 MB. Helps finance match your payment faster.
            </p>
          )}
        </div>
        <Alert tone="info">
          No money moves in DFOS. This tells Divine Freight you have paid. Funds become available only after finance verifies the receipt.
        </Alert>
      </form>
    </Modal>
  );
}

export function ClientPaymentsPanel({ d }: { d: ShipmentDetail }) {
  const [notifyFor, setNotifyFor] = useState<NotifyTarget | null>(null);
  const [viewing, setViewing] = useState<ShipmentDocument | null>(null);
  const closed = d.shipment.stage === "closed";
  const issued = d.invoices.filter((i) => i.invoice.status === "issued");
  const totals = totalsList(d.row.finance);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Funding requests" description="Money Divine Freight needs from you to pay duties and charges on your behalf." />
        {d.fundingRequests.length === 0 ? (
          <EmptyState title="No funding requests on this shipment." />
        ) : (
          <TableWrap label="Funding requests">
            <thead>
              <tr>
                <th className={th}>Purpose</th>
                <th className={th}>Requested</th>
                <th className={th}>Received (verified)</th>
                <th className={th}>Due</th>
                <th className={th}>Status</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.fundingRequests.map(({ request: f, status, verified }) => (
                <tr key={f.id} data-testid="client-funding-row">
                  <td className={td}>{f.purpose}</td>
                  <td className={td}>
                    <Money minor={f.amount} currency={f.currency} />
                  </td>
                  <td className={td}>
                    <Money minor={verified} currency={f.currency} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(f.dueDate)}</td>
                  <td className={td}>
                    <FundingBadge status={status} />
                  </td>
                  <td className={td}>
                    {!closed && (status === "awaiting_payment" || status === "partially_funded") && (
                      <Button
                        size="sm"
                        data-testid="notify-payment"
                        onClick={() =>
                          setNotifyFor({
                            target: { kind: "funding_request", fundingRequestId: f.id },
                            shipmentId: f.shipmentId,
                            label: `${d.shipment.reference} · ${f.purpose}`,
                            currency: f.currency,
                            suggested: Math.max(0, f.amount - verified),
                          })
                        }
                      >
                        Notify payment
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
        <CardHeader title="Your payment notifications" />
        {d.notifications.length === 0 ? (
          <EmptyState title="You have not notified any payments on this shipment." />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="client-notifications">
            {d.notifications.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  <Money minor={n.amount} currency={n.currency} /> · ref {n.payerReference} · paid {formatDate(n.paidOn)}
                  {n.rejectionReason && <span className="block text-xs text-red-800">{n.rejectionReason}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <PopLink n={n} documents={d.documents} onView={setViewing} />
                  <NotificationStatus n={n} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Statement of client funds" description="Verified money received from you and payments made on your behalf. These are pass-through funds, not Divine Freight fees." />
        <div className="space-y-3 p-4">
          {totals.length === 0 ? (
            <p className="text-sm text-slate-500">No funds recorded yet.</p>
          ) : (
            totals.map((t) => (
              <dl key={t.currency} className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid={`client-statement-${t.currency}`}>
                <div>
                  <dt className="text-xs text-slate-500">Received (verified)</dt>
                  <dd><Money minor={t.verifiedClientFunds} currency={t.currency} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Paid on your behalf</dt>
                  <dd><Money minor={t.disbursed} currency={t.currency} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Held for you</dt>
                  <dd><Money minor={t.clientFundsHeld} currency={t.currency} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Owed to Divine Freight</dt>
                  <dd className={t.unrecoveredDisbursements ? "font-semibold text-red-800" : ""}>
                    <Money minor={t.unrecoveredDisbursements} currency={t.currency} />
                  </dd>
                </div>
              </dl>
            ))
          )}
          {d.disbursements.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded border border-slate-200 text-sm">
              {d.disbursements.map((x) => (
                <li key={x.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span>
                    {DISBURSEMENT_CATEGORY_LABEL[x.category]} · {x.payee} · {formatDate(x.paidOn)}
                  </span>
                  <Money minor={x.amount} currency={x.currency} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Service invoice" />
        {issued.length === 0 ? (
          <EmptyState title="No invoice issued yet." />
        ) : (
          issued.map(({ invoice, lines, total }) => {
            const paid = d.receipts.filter((r) => !r.reversed && r.allocation.kind === "invoice" && r.allocation.invoiceId === invoice.id).reduce((s, r) => s + r.amount, 0);
            const outstanding = Math.max(0, total - paid);
            return (
              <div key={invoice.id} className="space-y-2 p-4 text-sm" data-testid="client-invoice">
                <div className="font-medium">
                  {invoice.number} · issued {formatDate(invoice.issuedAt)}
                </div>
                <ul className="divide-y divide-slate-100 rounded border border-slate-200">
                  {lines.map((l) => (
                    <li key={l.id} className="flex justify-between px-3 py-1.5">
                      <span>{l.description}</span>
                      <Money minor={l.amount} currency={invoice.currency} />
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    Total <Money minor={total} currency={invoice.currency} />
                  </span>
                  <span>
                    Paid <Money minor={paid} currency={invoice.currency} />
                  </span>
                  <span className={outstanding ? "font-semibold" : ""}>
                    Outstanding <Money minor={outstanding} currency={invoice.currency} />
                  </span>
                  {outstanding > 0 && !d.notifications.some((n) => n.status === "notified" && n.target.kind === "invoice" && n.target.invoiceId === invoice.id) && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setNotifyFor({
                          target: { kind: "invoice", invoiceId: invoice.id },
                          shipmentId: invoice.shipmentId,
                          label: `${invoice.number} (service invoice)`,
                          currency: invoice.currency,
                          suggested: outstanding,
                        })
                      }
                      data-testid="notify-invoice-payment"
                    >
                      Notify payment
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Card>
      <NotifyPaymentModal t={notifyFor} onClose={() => setNotifyFor(null)} />
      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/** "Proof of payment" link for a notification, if the client attached one. */
export function PopLink({ n, documents, onView }: { n: PaymentNotification; documents: ShipmentDocument[]; onView: (d: ShipmentDocument) => void }) {
  const doc = n.popDocumentId ? documents.find((x) => x.id === n.popDocumentId) : undefined;
  if (!doc) return <span className="text-xs text-slate-400">No proof attached</span>;
  return (
    <button type="button" onClick={() => onView(doc)} className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline" data-testid="view-pop">
      <Paperclip className="size-3.5" aria-hidden /> Proof of payment
    </button>
  );
}

export function ClientRequestsPage() {
  const { data, error, isPending, refetch } = useWorkspace();
  const [notifyFor, setNotifyFor] = useState<NotifyTarget | null>(null);
  if (isPending) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const s = data.snapshot;
  const ship = (id: string) => s.shipments.find((x) => x.id === id)!;
  const requests = [...s.fundingRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const invoices = s.invoices.map((inv) => {
    const total = s.invoiceLines.filter((l) => l.invoiceId === inv.id).reduce((t, l) => t + l.amount, 0);
    const paid = s.receipts.filter((r) => !r.reversed && r.allocation.kind === "invoice" && r.allocation.invoiceId === inv.id).reduce((t, r) => t + r.amount, 0);
    return { inv, total, paid, outstanding: Math.max(0, total - paid) };
  });
  return (
    <div>
      <PageHeader title="Funding & invoices" subtitle="Funding requests for duties and charges, and Divine Freight service invoices." />
      <Card className="mb-4">
        <CardHeader title="Funding requests" />
        {requests.length === 0 ? (
          <EmptyState title="No funding requests." />
        ) : (
          <TableWrap label="Funding requests">
            <thead>
              <tr>
                <th className={th}>Shipment</th>
                <th className={th}>Purpose</th>
                <th className={th}>Requested</th>
                <th className={th}>Verified</th>
                <th className={th}>Due</th>
                <th className={th}>Status</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.map((f) => {
                const st = fundingRequestStatus(f, s.receipts, s.notifications);
                const verified = verifiedForRequest(f.id, s.receipts);
                return (
                  <tr key={f.id} data-testid="client-request-row">
                    <td className={`${td} whitespace-nowrap`}>
                      <Link className="text-navy-700 hover:underline" href={`/client/shipments/${f.shipmentId}?tab=payments`}>
                        {ship(f.shipmentId).reference}
                      </Link>
                    </td>
                    <td className={td}>{f.purpose}</td>
                    <td className={td}>
                      <Money minor={f.amount} currency={f.currency} />
                    </td>
                    <td className={td}>
                      <Money minor={verified} currency={f.currency} />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(f.dueDate)}</td>
                    <td className={td}>
                      <FundingBadge status={st} />
                    </td>
                    <td className={td}>
                      {ship(f.shipmentId).stage !== "closed" && (st === "awaiting_payment" || st === "partially_funded") && (
                        <Button
                          size="sm"
                          onClick={() =>
                            setNotifyFor({
                              target: { kind: "funding_request", fundingRequestId: f.id },
                              shipmentId: f.shipmentId,
                              label: `${ship(f.shipmentId).reference} · ${f.purpose}`,
                              currency: f.currency,
                              suggested: Math.max(0, f.amount - verified),
                            })
                          }
                        >
                          Notify payment
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <Card>
        <CardHeader title="Service invoices" />
        {invoices.length === 0 ? (
          <EmptyState title="No invoices issued." />
        ) : (
          <TableWrap label="Service invoices">
            <thead>
              <tr>
                <th className={th}>Invoice</th>
                <th className={th}>Shipment</th>
                <th className={th}>Total</th>
                <th className={th}>Paid</th>
                <th className={th}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(({ inv, total, paid, outstanding }) => (
                <tr key={inv.id}>
                  <td className={td}>{inv.number}</td>
                  <td className={td}>
                    <Link className="text-navy-700 hover:underline" href={`/client/shipments/${inv.shipmentId}?tab=payments`}>
                      {ship(inv.shipmentId).reference}
                    </Link>
                  </td>
                  <td className={td}>{formatMoney(total, inv.currency)}</td>
                  <td className={td}>{formatMoney(paid, inv.currency)}</td>
                  <td className={td}>{formatMoney(outstanding, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <NotifyPaymentModal t={notifyFor} onClose={() => setNotifyFor(null)} />
    </div>
  );
}
