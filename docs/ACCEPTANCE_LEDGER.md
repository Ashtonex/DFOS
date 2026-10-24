# DFOS — Acceptance Ledger

Allowed statuses: **PASS**, **FAIL**, **BLOCKED**, **NOT RUN**. A status is never set to PASS just because the code exists.
Browser checks run with Playwright 1.64 (Chromium headless shell 156) against the production server (`next start -p 3100`). Each test runs in a fresh browser context, so its IndexedDB is isolated and the presenter's `dfos-demo` database is never touched.

**Evidence logs** from the final run on 2026-10-24 are in `docs/evidence/`:
- `typecheck.log`
- `lint.log`
- `unit-tests.log`
- `build.log`
- `e2e.log`
- `e2e-stability-repeat2.log`

Playwright traces for failing tests are written to `test-results/`, which is gitignored.

## Final summary

| Check | Command | Result |
|---|---|---|
| Type checking | `npx tsc --noEmit` | **PASS** (exit 0) |
| Lint | `npx eslint .` | **PASS** (exit 0) |
| Unit, finance-fixture, rules, seed and repository tests | `npx vitest run` | **PASS**: 83/83 |
| Production build | `npm run build` | **PASS** (exit 0) |
| Browser checks | `npx playwright test` | **PASS**: 27/27 |
| Browser stability | `npx playwright test --repeat-each=2` | **PASS**: 54/54 |
| Firefox / Safari | — | **NOT RUN** (Chromium only) |
| Screen-reader / full WCAG audit | — | **NOT RUN** |

## Foundation Gate (verified 2026-10-24; re-verified in every later full run)

| ID | Requirement | Status | Implementation | Method | Actual result | Evidence | Limitation | Next |
|---|---|---|---|---|---|---|---|---|
| FG-01 | Navbar and sidebar keep their DOM identity during internal navigation | PASS | `app/(dfos)/layout.tsx`, `src/components/shell/AppShell.tsx` | `e2e/foundation.spec.ts` "FG-01/FG-02": stores the navbar and sidebar node references on `window`, makes 6 sidebar and in-page navigations (dashboard, list, settings, nested detail, tab), then compares nodes with `===` | Same nodes after every hop | `e2e.log` | — | — |
| FG-02 | Internal links use client-side navigation | PASS | `next/link` everywhere and no `window.location` | Same test: a random `window` marker survives every hop and `performance.getEntriesByType('navigation').length === 1` | Marker kept and 1 navigation entry | `e2e.log` | — | — |
| FG-03 | Sidebar preference survives route changes | PASS | `src/lib/sidebar.ts`, the inline script in `app/layout.tsx` | "FG-03/FG-04": collapse, then navigate client-side, then assert `html[data-sidebar=collapsed]`, `aria-pressed=true` and sidebar width < 80px | Kept, same document | `e2e.log` | — | — |
| FG-04 | Sidebar preference survives refresh | PASS | as above | Reload, then the same assertions; expand and reload restores the expanded state | Restored before paint | `e2e.log` | — | — |
| FG-05 | Shipment edits update list and detail | PASS | `ShipmentEditForm.tsx`, `repository.updateShipment`, `useDfosMutation` + topic invalidation | "FG-05/FG-06/FG-09": edit DF-2026-0101 with a unique timestamped description, save, check the detail, then navigate client-side to the list and check the row | Both views show the new value with no reload | `e2e.log` | — | — |
| FG-06 | Saved edits survive refresh | PASS | IndexedDB `dfos-demo`, `src/data/db.ts` | Reload, then check the value in the list and detail **and** that `meta.seed` is identical before and after (no reseed). The repository close/reopen test shows the same | Value persisted; seed metadata unchanged | `e2e.log`, `unit-tests.log` | — | — |
| FG-07 | Nested routes load directly | PASS | `app/(dfos)/operations/shipments/[shipmentId]/page.tsx` | `page.goto('/operations/shipments/shp-0102?tab=milestones')` and an unknown id; R-01 also loads 28 routes directly | Correct record and tab; the unknown id shows "Shipment not found" | `e2e.log` | — | — |
| FG-08 | Browser back and forward | PASS | URL-driven tabs and list state | list → detail → tab, then back ×2, then forward ×2, checking the URL, record and active tab each time | Every step correct; same document throughout | `e2e.log` | — | — |
| FG-09 | Typing and saving work without blocking errors | PASS | `e2e/fixtures.ts` collects console errors, page errors (uncaught and unhandled rejections) and HTTP ≥ 400 | Real key typing, inline validation (empty Origin → "Origin is required."), save. **Every** browser test asserts that the error list is empty | No errors | `e2e.log` | — | — |
| FG-09b | Unsaved-change warning only when appropriate | PASS | `useUnsavedChangesGuard` in `src/lib/hooks.ts` | Clean form navigates with no dialog. A dirty form with in-app navigation gets a confirm, and dismissing it stays with the edit intact. After saving, no dialog appears. G-02 also checks the warning on a dirty request form | 0 → 1 → 1 dialogs as expected | `e2e.log` | Browser **Back** with a dirty form does not warn; the App Router has no supported API to block history pops. Reload and close do warn | — |
| FG-10 | Production build passes | PASS | — | `npm run build` | Exit 0 (Next 16.4.3 Turbopack, TypeScript step passed) | `build.log` | — | — |

### Foundation failure history

- **Initial FG run: FAIL (all 6 tests).** Every behavioural assertion passed, but the error assertion failed with 12 to 26 `404` responses.
  - Diagnosis: a response listener added to `e2e/fixtures.ts` showed that Next's prefetch of sidebar links to routes not yet built (`/operations/documents`, `/exceptions`, `/finance`, `/tasks`, `/management`, `/guide`) returned 404.
  - Fix: during the Foundation slice the navigation listed only implemented routes. That temporary filter was removed in Slice 4 once every route existed, and R-01 confirms that no navigation target returns 4xx.
  - Re-run: 6/6 passed.
- **Lint initially failed** with a false positive (`react-hooks/rules-of-hooks` on Playwright's fixture `use()`). The rule is now disabled for `e2e/**` only. Re-run: exit 0.

## Slice 2 — Shipment workflow

| ID | Requirement | Status | Implementation | Method | Actual result | Limitation / history |
|---|---|---|---|---|---|---|
| W-01 | Client request creation; persists; visible in Operations; double submit creates one record | PASS | `ClientRequestForm.tsx`, `repository.createShipmentRequest` (opId) | `e2e/workflow.spec.ts` W-01: real form, **double-click** submit, list count, reload, switch to Operations, search. Also `repository.test.ts`: concurrent same-opId calls → 1 record | Exactly 1 record; survives reload; Operations shows it as *New request · Unassigned* | — |
| W-02 | Upload validation, safe rendering, reopen after refresh, reject with reason and history, accept, client isolation | PASS | `DocumentsPanel.tsx`, `DocumentViewer.tsx`, `domain/files.ts`, `repository.uploadDocument/reviewDocument` | W-02: HTML disguised as `.pdf` → "content does not match"; `.html` → type error; a `.txt` reopens after reload and `<b>` renders as literal text; reject without reason is blocked; reject with reason; **double-click** accept; 2-entry history; KAP persona gets *not found* on the EHIS file; the client sees the reason | As expected | — |
| W-03 | Invalid transitions blocked with reasons; assignment; supervisor override needs a reason and is audited | PASS | `WorkflowPanel.tsx`, `domain/rules.ts`, `repository.transitionStage` | W-03 plus `tests/unit/rules.test.ts` (7 transition tests) | Blockers listed; button disabled until requirements are met; override milestone and `override.used` audit event | — |
| W-04 | Management persona is read-only | PASS | `canWrite`, repository role checks | W-04 (UI) plus a repository test (the update is refused with `forbidden`) | No edit or stage controls; repository refuses | — |
| W-05 | Readiness derives from required documents; missing or rejected blocks it | PASS | `computeReadiness`, `requirementViews` | `rules.test.ts` "document readiness"; G-01 | Correct counts and status | — |
| W-06 | Stale edit conflicts never silently overwrite | PASS (repository) / NOT RUN (browser) | `expectedVersion` + `ConflictError`; form banner with "Discard my edits and load latest" | `repository.test.ts` "rejects stale edits" | Stale save rejected; newer value kept | The two-tab dirty-form banner was not exercised in a browser test |

## Slice 3 — Exceptions and money

| ID | Requirement | Status | Implementation | Method | Actual result | Limitation / history |
|---|---|---|---|---|---|---|
| M-01 | External delay requires category, owner, next action and follow-up; creates a blocking follow-up; visible in queues; resolving closes the follow-up | PASS | `TasksExceptionsTab.tsx`, `OpsQueues.tsx`, `repository.recordException/resolveException` | `e2e/money.spec.ts` M-01: empty submit → inline error; **double-click** submit → 1 exception; follow-up cannot be completed directly; queue filter; resolve | As expected; labelled *Manually recorded* | — |
| M-02 | A client notification is never funds; verification creates exactly one receipt; the client sees the confirmation | PASS | `ClientPayments.tsx`, `FinanceTab.tsx`, `repository.notifyPayment/verifyPayment` | M-02: `12.345` → "Use at most two decimal places."; notified 6,800 / verified 0 / held 0; **double-click** verify → 1 receipt; verified and held 6,800; client sees *Verified by finance*. Repository test: a second verification → `already_resolved` | As expected | — |
| M-03 | Disbursement beyond funds blocked with a useful error; supervisor pre-funding with reason → unrecovered | PASS | `repository.recordDisbursement` | M-03 plus repository tests (officer pre-fund → `forbidden`; refund > held → validation; ZAR funds cannot pay USD) | The error states the available funds; pre-funded 150.00 → unrecovered USD 150.00 | — |
| M-04 | Invoice draft → issue; client sees issued invoices only; zero amount rejected | PASS | `repository.addInvoiceLine/issueInvoice`, `scopeSnapshot` | M-04 | Draft hidden from the client; issued invoice visible | — |
| F-01 | Financial acceptance fixture | PASS | `src/domain/finance.ts` | `tests/unit/finance.test.ts`: explicit inputs, formulas and expected values for requested, notified, verified, disbursed, held, unrecovered, funding outstanding, invoiced, paid, invoice outstanding, costs, contribution and margin | 13/13 figures match | — |
| F-02 | Edge cases: zero/invalid amounts, partial funding, duplicate verification, over-disbursement, overpayment, reversal, currency separation, rounding | PASS | `money.ts`, `finance.ts`, repository | `money.test.ts` (parsing; half-away rounding at the 0.5 bp boundary), `finance.test.ts`, `repository.test.ts` "money controls" and "duplicate-submission protection" | All pass | Only USD and ZAR are configured; no FX by design |
| F-03 | Related writes are atomic; failures leave no partial state | PASS | `mutate()`: one IndexedDB transaction per mutation | `repository.test.ts` "atomicity" (throws after 2 writes; counts unchanged; a blocked transition changes no version or milestone) | No partial records | — |

## Slice 4 — Connected workspaces

| ID | Requirement | Status | Implementation | Method | Actual result | Limitation / history |
|---|---|---|---|---|---|---|
| C-01 | Every management KPI reconciles with its drill-down (counts and money) | PASS | `SHIPMENT_KPIS` shared predicates, `ManagementPages.tsx`, list `?kpi=` | `e2e/connected.spec.ts` C-01: 8 KPI tiles → row count equals the tile; unrecovered and funding-outstanding money tiles equal the drill-down totals; the officer workload link count equals the rows. Also `seed.test.ts` drill-down equality | All reconcile | — |
| C-02 | An Operations change appears in Management without reload | PASS | topic invalidation | C-02 (document marker kept) | External delays +1 | — |
| C-03 | Same-browser tabs receive updates | PASS | `BroadcastChannel('dfos-changes')`, `src/lib/sync.ts`; focus revalidation | C-03: tab B records an exception, and tab A's KPI updates with no reload or focus change | Updated | **History: 1 FAIL in the first final run.** The test changed the persona `<select>` before React hydrated, so the change was lost (a real race for very fast or slow users). Fix: the switcher is disabled until hydrated. Re-run: 27/27, then 54/54 in two repeats |
| C-04 | Persona switching changes records; no cross-client leakage in lists, search, documents, detail URLs or internal workspaces; internal notes and exception wording hidden | PASS | `scopeSnapshot`, `WorkspaceGate` | C-04 plus `repository.test.ts` "client scoping" (4 tests: lists, details, search, files, mutations) | No leakage observed | Demo filtering, not a security boundary. C-04 initially failed because the test read the list before it loaded; fixed with retrying assertions (test-only) |

## Slice 5 — Demonstration and polish

| ID | Requirement | Status | Implementation | Method | Actual result | Limitation / history |
|---|---|---|---|---|---|---|
| G-01 | Complete guided scenario DF-DEMO-2026-001 without developer intervention | PASS | `GuidePage.tsx` + all workflow screens | `e2e/guided.spec.ts` G-01 is driven only by the UI and the guide's **Go** buttons: request, assign, preparation, 5 uploads, reject and re-upload, accept, ready, submission ref, external delay, management view, funding, notification, verification, disbursement, release evidence, in delivery, POD, delivered, closure blocked (open exception and un-issued invoice), invoice issued and paid, resolve, **Closed**. All 16 guide ticks are done and the client view is client-safe. A repository-level replica of the scenario also passes | Completed in about 21 s | — |
| G-02 | Reset restores the presentation state; repeatable; duplicate guided request refused | PASS | `SettingsPage.tsx`, `db.resetDatabase` | G-02 plus `repository.test.ts` "reset" (entity counts, referential integrity, every document has bytes) | 14 files after reset and after reload; guide back to step 1 | Initially failed because the test did not expect the (correct) unsaved-changes prompt; the test now asserts and accepts it |
| R-01 | Every main route at 360px and 1280px: no horizontal page overflow, one h1, all fields labelled, no console errors or 4xx | PASS | layout, `TableWrap` | `e2e/ux.spec.ts` R-01: 28 routes × 2 viewports | Pass | **History: FAIL** (285px overflow at 360px on the Finance tab). Cause: absolutely positioned `sr-only` table headers escaped the scroll container. Fix: `relative` on `TableWrap`. Re-run passed |
| R-02 | Mobile drawer opens, closes after client-side navigation and on Escape | PASS | `MobileDrawer` | R-02 | Pass | — |
| R-03 | Forms work at 360px | PASS | — | R-03 (client request submitted at 360×780) | Pass | — |
| A-01 | Keyboard-operable dialogs; focus stays inside; restored on close | PASS | `Modal` + `trapTab` | A-01: Enter opens, 12 × Tab stays inside, Escape closes, focus returns to the trigger | Pass | **History: FAIL** (focus left the native modal after its last element). Fix: Tab wrap in `Modal` and the drawer. Re-run passed |
| A-02 | Status shown in text as well as colour; visible keyboard focus | PASS | text badges, `:focus-visible` outline | A-02 | Pass | No screen-reader session or full WCAG audit (NOT RUN) |
| P-01 | Unavailable storage gives an actionable error; never a memory fallback | PASS | `StorageUnavailableError` | `e2e/storage.spec.ts` (IndexedDB removed before load) | Error with remediation shown; no rows; the shell still renders | — |
| S-01 | Seed is deterministic, varied and satisfies its own invariants | PASS | `src/data/seed.ts` | `tests/unit/seed.test.ts` (5 tests) | Pass | **History: defect found during visual review.** DF-2026-0104 disbursed USD 1,800 against USD 1,000 verified without a pre-fund flag. Fixed (duty USD 1,000). A new invariant test was shown to fail on the old value and pass on the fix |

## Definition of Done mapping

| Item | Status | Evidence |
|---|---|---|
| Three connected workspaces function | PASS | C-01..C-04, G-01 |
| Shell identity persists; internal links avoid document reloads | PASS | FG-01, FG-02, C-02, C-03 |
| Nested routes load directly | PASS | FG-07, R-01 |
| Demonstration records persist after refresh | PASS | FG-06, W-01, W-02, G-02; repository close/reopen test |
| Core forms perform real mutations | PASS | W-*, M-*, G-01 |
| Uploaded documents persist and reopen | PASS | W-02; repository bytes-after-reopen test |
| Cross-workspace views consistent; same-browser tabs updated | PASS | C-02, C-03 |
| Workflow rules prevent invalid transitions | PASS | W-03, G-01, `rules.test.ts` |
| Financial calculations match explicit fixtures | PASS | F-01, F-02 |
| Management figures derive from stored records; KPI drill-downs reconcile | PASS | C-01; seed drill-down test |
| Client-visible content scoped; internal notes excluded | PASS | C-04; repository scoping tests |
| External statuses honestly labelled | PASS | M-01 (*Manually recorded*); guide and handover wording |
| Visible primary actions work; no unexplained placeholders on main routes | PASS | R-01 visits every main route with no 4xx; G-01 uses every primary workflow action |
| No known blocking console errors | PASS | every browser test asserts zero console errors, page errors and HTTP ≥ 400 |
| Type checking and production build pass | PASS | `typecheck.log`, `build.log` |
| Required automated and browser checks pass | PASS | `unit-tests.log` 83/83, `e2e.log` 27/27, `e2e-stability-repeat2.log` 54/54 |
| Guided demonstration completes without developer intervention | PASS | G-01 |
| Reset and recovery documented and verified | PASS (reset, automated) / NOT RUN (manual DevTools database-deletion procedure) | G-02; `docs/HANDOVER.md` §6 |
| Production readiness | Not claimed | See `docs/HANDOVER.md` "Remaining limitations" |
