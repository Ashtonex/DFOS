# DFOS — Divine Freight Operating System (prototype)

A working demonstration prototype built by **Flectēre** for **Divine Freight Services**. It provides three connected workspaces (Operations, Client portal and Management) over one shared set of fictional records, stored durably in the browser's IndexedDB.

> Fictional demonstration data. **Not production software.** DFOS does not process payments, does not integrate with customs (e.g. ZIMRA) or any authority, and cannot approve clearance or influence official decisions.

## Quick start

Requirements: Node.js ≥ 20.9 (verified on 24.18) and npm. No environment variables or external credentials are needed.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Open http://localhost:3000. For development with hot reload, use `npm run dev` instead.

## Verification

| Command | What it runs |
|---|---|
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm test` | Vitest: money, finance fixture, workflow rules, seed invariants, repository (isolated fake IndexedDB) |
| `npm run test:e2e` | Playwright browser checks against `next start` on port 3100. Run `npm run build` first. The first run also needs `npx playwright install chromium`. |
| `npm run verify` | typecheck + lint + unit tests + build |

## Documents

- [Engineering handover](docs/HANDOVER.md): architecture, demo script, personas, persistence, reset/recovery, limitations
- [Acceptance ledger](docs/ACCEPTANCE_LEDGER.md): every criterion with method, actual result and evidence
- [Prototype business assumptions](docs/PROTOTYPE_ASSUMPTIONS.md): fictional rules pending Divine Freight validation
- [Engineering plan](docs/ENGINEERING_PLAN.md)
