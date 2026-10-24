# DFOS — Engineering Plan

DFOS (Divine Freight Operating System) is a demonstration prototype that Flectēre is building for Divine Freight Services.

## Baseline (inspected 2026-10-24)

- The repository directory was **empty**: no code, no git history, no instructions and no prior claims of completion to verify.
- Toolchain available: Node 24.18.0, npm 11.18.0, git 2.53. pnpm was not available, so npm is the package manager (`package-lock.json`).
- Known failures at baseline: none, because nothing existed yet.

## Stack (empty-repository default)

| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js 16.4 App Router, React 19.3, TypeScript 5.9 | Required default. TypeScript 7 (the native port) was skipped because Next's type tooling targets 5.x. |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`) | Required default. It is the only styling system. |
| Validation | Zod 4 | Validates mutation inputs inside the repository |
| Persistence | IndexedDB via `idb` 8 | Durable local demo data and document blobs |
| Shared data | TanStack Query 5 | One query-key strategy with targeted invalidation after mutations |
| Icons | lucide-react | One consistent icon set |
| Unit/integration tests | Vitest 5 + fake-indexeddb | Pure rules, money logic and repository tests on an isolated database |
| Browser tests | Playwright 1.64 (Chromium) | Run against `next start`. Each test gets a fresh browser context, so its IndexedDB is isolated from the presenter's browser. |

## Persistent shell ownership

- `app/layout.tsx` (server) owns `<html>`/`<body>`, an inline pre-paint script that applies the sidebar preference, and `<Providers>` (QueryClient, persona store, cross-tab bridge).
- `app/(dfos)/layout.tsx` renders `<AppShell>`, which owns the navbar, sidebar, mobile drawer, persona switcher, global search, notifications and main frame. Every workspace route lives under `(dfos)`, so the shell never remounts during internal navigation. It is **not** keyed by pathname.
- The Suspense or loading boundary is placed **inside** the main content frame. The shell itself is never replaced.

## Route structure

```
app/(dfos)/operations/{page, shipments/, shipments/[shipmentId], documents, exceptions, finance, tasks}
app/(dfos)/client/{page, shipments/, shipments/new, shipments/[shipmentId], requests, documents}
app/(dfos)/management/{page, shipments (KPI drill-down), exceptions, finance, performance}
app/(dfos)/settings, app/(dfos)/guide
```

## Domain model

All types live in `src/domain/types.ts`:

- `Client`, `User` (personas and officers) and `Shipment`
- `Milestone` (stage history), `DocumentRequirement`, `ShipmentDocument` and `DocumentBlob`
- `Task`, `ShipmentException`, `FundingRequest`, `PaymentNotification`, `Receipt` (verified), `Disbursement`
- `Invoice`, `InvoiceLine`, `OperationalCost` and `ActivityEvent`

A shipment keeps its operational stage, document readiness (derived), funding status (derived) and exception status (derived) as separate concepts.

## Persistence

- IndexedDB database `dfos-demo` at schema version 1, with one object store per entity plus `blobs`, `meta` and `ops` (idempotency keys).
- Initialisation is idempotent: the database seeds only if `meta.seededAt` is absent, inside one transaction. Seeding never runs because a provider mounted or a query came back empty.
- Reset is an explicit, confirmed action that clears **all** stores and reseeds in one transaction.
- If IndexedDB is unavailable, the app raises `StorageUnavailableError` and shows an actionable message. It never falls back to memory.
- `localStorage` holds UI preferences only (sidebar collapse and persona).

## Mutation and update propagation

- The repository (`src/data/repository.ts`) is the **only** module that touches IndexedDB. Each mutation validates its input with Zod, opens one read-write transaction across every affected store, checks the business rules synchronously inside that transaction, writes the records and their activity events, and commits atomically.
- Each mutation returns the topics it changed. `useDfosMutation` invalidates the query keys mapped to those topics and broadcasts the same topics over `BroadcastChannel('dfos-changes')`. Other tabs invalidate locally and never rebroadcast, so invalidation cannot loop. Queries also revalidate when the window regains focus.
- Duplicate prevention: critical writes carry an `opId` (an idempotency key). A repeated `opId` returns the original result and creates no new record. State guards add a second check, for example a notification that is already verified cannot be verified again.
- Stale edits: shipment edits send `expectedVersion`. A version mismatch raises `ConflictError`, and the form offers to load the latest values. Saves never silently overwrite newer data.

## Client scoping

Every read takes a `Viewer` (`staff` or `client` + `clientId`). Client reads filter by `clientId` and are mapped through sanitisers that strip internal notes, internal activity and exception internals. The client detail route returns *not found* for another client's shipment. Search and blob retrieval are scoped the same way.

> The demo persona switcher demonstrates experience and filtering. It is not production authentication or a security boundary.

## Verification commands

`npm run typecheck`, `npm run lint`, `npm test` (Vitest), `npm run build` and `npm run test:e2e` (Playwright against `next start`).

## Immediate Foundation Gate work

Build the shell, personas (minimal), repository and seed, shipment list, shipment detail and edit form, then run the FG-01..FG-10 browser checks. No other modules start until those checks pass.
