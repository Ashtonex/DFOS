# DFOS — Engineering Handover

**Product:** DFOS (Divine Freight Operating System) · **Client:** Divine Freight Services · **Technology partner:** Flectēre
**Status:** working demonstration prototype with fictional data. Not production-ready; see [Limitations](#remaining-limitations).

---

## 1. Commands

| Purpose | Command |
|---|---|
| Install | `npm install` (npm 11, `package-lock.json`) |
| Development server | `npm run dev` → http://localhost:3000 |
| Production build | `npm run build` |
| Run production build | `npm start` → http://localhost:3000 |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit and repository tests | `npm test` |
| Browser tests | `npx playwright install chromium` (once), then `npm run build && npm run test:e2e` |
| Everything except browser tests | `npm run verify` |

**Environment:**
- Node.js ≥ 20.9 (verified on 24.18.0, Windows 11).
- No environment variables, API keys, backend or network services are required.
- The browser must allow IndexedDB for the site. Private modes that block storage show an actionable error instead of running with in-memory data.

## 2. Demo personas

A clearly labelled **DEMO** persona switcher sits in the top bar, to the right of the notification bell.

| Persona | Workspace | Notes |
|---|---|---|
| Operations: Rudo Chikore, Operations Supervisor | `/operations` | All actions, including supervisor overrides, pre-funding and reopening |
| Management: Tafadzwa Mhlanga, Managing Director | `/management` | Read-only; can also open Operations screens read-only |
| Client · Eastern Highlands Industrial: Grace Mukoko | `/client` | Owner of the guided demo shipment |
| Client · Kariba Agro Processors: Peter Zhou | `/client` | |
| Client · Zambezi Medical Distributors: Ruvimbo Dube | `/client` | |

> **The demo persona switcher demonstrates experience and filtering. It is not production authentication or a security boundary.** The choice is stored in `localStorage` (`dfos.persona`).

When you switch persona, DFOS keeps you on the current page if that persona may see it. Otherwise it opens the persona's workspace home. Opening a client route as staff, or a staff route as a client, shows a "choose a persona" panel instead of data.

## 3. Meeting demonstration script (about 12 minutes)

Before the meeting: **Settings → Reset demonstration data**, then open **Demo guide**. Each step's **Go** button switches persona and opens the right screen, and the ticks are derived from the stored records.

1. **Management overview (1 min).** Open as Management. Point out active files, files awaiting documents and client funds, external delays, overdue follow-ups, unrecovered disbursements and officer workload. Click any figure to show exactly the files behind it (e.g. *Files with unrecovered disbursements* → total matches).
2. **Client request (1 min).** Guide step 1 → **Fill guided demo values** → Submit. DFOS immediately lists the five documents needed.
3. **Operations picks it up (1 min).** Step 2 → assign Tendai Moyo → *Move to Preparation*. The *Next step* panel always explains what is blocking the next stage.
4. **Documents and accountability (2 min).** The client uploads; Operations rejects the certificate of origin with a reason. The client sees the reason, re-uploads, and Operations accepts. Expand the requirement to show the preserved history. Readiness changes to *complete* everywhere.
5. **Submission and an external delay (2 min).** Move to Submitted: DFOS assigns its lodgement reference automatically, and the customs reference is optional and shows as *Awaited from customs* until recorded. Record an *External processing delay* with owner, next action and follow-up date. Switch to Management → Exceptions to show it is visible with its follow-up. The client sees only a neutral progress line.
6. **Money control (3 min).** Request funding. The client notifies payment and attaches proof of payment (a PDF or screenshot). It shows as *Notified, unverified* and is **not available funds**. Operations opens the proof, verifies the actual receipt with a bank reference, then records the disbursement. Optionally try to over-disburse to show the block and the supervisor pre-funding path.
7. **Release, delivery, invoice and closure (2 min).** Attach release evidence, then proof of delivery. Try *Close*: blockers list the open exception and the un-issued invoice. Issue the invoice; the client notifies and Operations verifies. Resolve the exception, then close.
8. **Close the loop.** Show the closed file in the client portal and the updated management figures.

Keep two talking points honest: DFOS improves **readiness, evidence, accountability, visibility and follow-up**, and all external statuses are **manually recorded or simulated**.

## 4. Architecture

```
app/layout.tsx                 <html>/<body>, pre-paint sidebar script, <Providers>
app/(dfos)/layout.tsx          <AppShell> — the ONE persistent shell for every workspace
app/(dfos)/{operations,client,management,settings,guide}/…   thin route files → src/components/*
src/domain/                    pure, framework-free: types, rules, finance, money, derive (KPIs), files, labels
src/data/db.ts                 IndexedDB open/upgrade/seed/reset (only data/* touches it)
src/data/seed.ts               deterministic fictional seed (dates relative to the reset moment)
src/data/repository.ts         the single domain boundary: scoped reads, validated atomic mutations, audit
src/lib/                       persona store, query keys + topics, cross-tab sync, hooks, URL state
src/components/                shell, UI kit, pages, shipment detail tabs, client portal
```

- **Shell ownership.** `AppShell` renders the navbar, sidebar, mobile drawer, persona switcher, global search, notifications and main frame. It lives in the `(dfos)` route-group layout, so internal navigation never remounts it, and it is never keyed by pathname. Active navigation comes from `usePathname()`. The page-level Suspense and loading boundaries sit *inside* `<main>`.
- **Providers.** `QueryClientProvider`, the cross-tab bridge and the toast provider live in the root layout. The persona and sidebar stores are module-level `useSyncExternalStore` stores. The sidebar preference is also applied to `<html data-sidebar>` by an inline script before first paint, so the layout does not shift.
- **Shared records.** Every workspace reads the same IndexedDB records through the repository. No page holds its own copy of shipments, balances, document statuses or totals: lists, dashboards, notifications and drill-downs all derive from one scoped snapshot (`getWorkspace`) using the pure functions in `src/domain/derive.ts`. A KPI count and its drill-down call the **same predicate** (`SHIPMENT_KPIS[k].test`).
- **Repository boundary and mutations.** Each mutation (`src/data/repository.ts`) does the following:
  1. Validates input with Zod.
  2. Opens **one read-write IndexedDB transaction**.
  3. Checks permissions, scoping and workflow rules (`src/domain/rules.ts`) synchronously inside it.
  4. Writes the business records **and** their activity events.
  5. Commits atomically. Any thrown error aborts the whole transaction, which is tested.

  Critical writes carry an idempotency key (`opId`). A replayed key returns the original result without new records. State guards cover the remaining cases: already-reviewed documents, already-verified notifications, duplicate bank references and the unique guided-demo reference.
- **Validation and transitions.** All rules live in `src/domain/rules.ts`, so the UI shows the repository's own blocker messages and both the tests and the guide reuse them. Stage changes advance one step at a time, and overrides need a supervisor and a reason.
- **Stale edits.** Shipment edits carry `expectedVersion`, and a mismatch raises `ConflictError`. The edit form adopts newer saved data automatically when it has no local changes. With local changes it warns and offers *Discard my edits and load latest*. It never silently overwrites.
- **Query invalidation.** Query keys start with a topic (`workspace`, `shipment`, `search`, `reference`, `seed`; see `src/lib/queryKeys.ts`). Each mutation declares its topics, and `useDfosMutation` awaits persistence, then invalidates only those topics (the `shipment` topic only for the affected id). No optimistic updates are used, so success is shown only after the commit and there is nothing to roll back.
- **Cross-tab updates.** After a local commit, the topics are posted on `BroadcastChannel('dfos-changes')`. Other tabs invalidate the same topics but never rebroadcast, so updates cannot loop. Queries also revalidate on window focus. There is no polling.
- **Client scoping.** Every read takes a `Viewer`, and `scopeSnapshot()` filters a client viewer to its own `clientId`. It also strips:
  - internal notes
  - tasks, exceptions and operational costs
  - draft invoices and pre-funding reasons
  - internal activity wording, keeping only `clientSummary` lines

  Another client's detail id returns *not found*, the same as a missing one. Search and document-file retrieval are scoped the same way, and client mutations re-check ownership inside the transaction.
- **Financial calculations.** `src/domain/finance.ts` stores integer minor units per currency, and totals are never mixed across currencies. It separates:
  - requested funding
  - unverified notifications
  - verified client-fund receipts
  - disbursements and client funds held
  - unrecovered disbursements
  - service invoiced and paid
  - operational costs and illustrative contribution and margin

  Margin is rounded half away from zero in basis points. `tests/unit/finance.test.ts` is the explicit acceptance fixture, with inputs, formulas and expected values.
- **Documents.** Uploads are checked for size (5 MB), extension and **content signature**, and the stored MIME type comes from the verified signature. Bytes are stored in IndexedDB and reopen after refresh. Text renders as text inside `<pre>`, never as HTML; images render in `<img>`; PDFs use the browser viewer. HTML and other active types are rejected. Rejected documents are kept as history.

## 5. Persistence model

- IndexedDB database **`dfos-demo`**, schema version 1, with one object store per entity plus `blobs` (document bytes), `meta` (seed marker) and `ops` (idempotency keys).
- **Seeding** happens only when `meta.seed` is absent, inside a transaction, so it is idempotent across tabs and reloads. It never reseeds because a provider mounted or a query came back empty.
- `localStorage` holds only UI preferences (`dfos.sidebarCollapsed`, `dfos.persona`).
- **Local demonstration data persists in this browser and origin. It is not shared between devices and is not a substitute for managed backups.**
- There is no service worker or offline caching.

## 6. Reset and recovery

- **Reset:** Settings & demo data → *Reset demonstration data* → confirm. One transaction clears every store and restores the full seed, including sample files, so there are no partial relationships (tested). Seed dates are relative to the reset moment, so "overdue" items stay overdue. Other open tabs refresh via the broadcast.
- **Broken database:** close other DFOS tabs → DevTools → Application → IndexedDB → delete `dfos-demo` → reload. A fresh database is created and seeded. The same procedure is shown in the app's Settings page.
- **Tests never touch `dfos-demo` in your browser.** Vitest uses uniquely named fake-IndexedDB databases, and Playwright uses fresh browser contexts.

## 7. Verification results

See [ACCEPTANCE_LEDGER.md](ACCEPTANCE_LEDGER.md) for every criterion. The final run on 2026-10-24 gave:

- `tsc` clean
- ESLint clean
- **83/83** Vitest tests
- `next build` exit 0
- **27/27** Playwright browser checks, including the complete guided scenario driven only through the UI

## Remaining limitations

1. **No real authentication or authorisation.** Personas are a demo filter, and all data lives client-side in one browser. Production needs server-side auth, an access boundary and a shared database.
2. **Single-browser persistence.** There is no backup, no multi-user sharing and no server. Clearing site data loses changes; a reset restores the demo.
3. **Unsaved-change warning on browser Back.** The guard covers in-app links and reload/close. The App Router offers no supported way to block a history *pop*, so Back with a dirty form leaves without a prompt.
4. **Integrations.** There are no customs (ZIMRA), bank, payment or email integrations. External statuses are labelled *manually recorded* or *simulated*.
5. **Business rules are assumptions.** Every rule in [PROTOTYPE_ASSUMPTIONS.md](PROTOTYPE_ASSUMPTIONS.md) needs Divine Freight's validation, including required documents per category, closure criteria and override policy.
6. **Currencies.** Only USD and ZAR are configured. There is no FX conversion by design.
7. **Browser coverage.** Automated browser checks ran on Chromium only (desktop 1280px and mobile 360px). Firefox and Safari were **not run**.
8. **Accessibility.** Checks covered labels, a single h1, keyboard dialogs, focus wrap and restore, visible focus and text status. No screen-reader session or full WCAG audit was performed.
9. **Profitability is illustrative**: service invoiced minus own costs, not statutory accounting.
10. **Git.** The repository was initialised during this work, but no commits were made. Committing is left to the team.

Production authentication, authorisation, shared hosting, backups, regulatory configuration and external integrations all require separate work.
