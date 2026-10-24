// IndexedDB access. Only src/data/* may import this module.
import { openDB, type IDBPDatabase } from "idb";
import { buildSeed, type SeedData } from "./seed";

export const SCHEMA_VERSION = 1;

/** Stores holding one row per entity, keyed by `id`. */
export const ENTITY_STORES = [
  "clients",
  "users",
  "shipments",
  "milestones",
  "requirements",
  "documents",
  "blobs",
  "tasks",
  "exceptions",
  "fundingRequests",
  "notifications",
  "receipts",
  "disbursements",
  "invoices",
  "invoiceLines",
  "costs",
  "activity",
] as const;
export type EntityStore = (typeof ENTITY_STORES)[number];
export type StoreName = EntityStore | "meta" | "ops";
export const ALL_STORES: StoreName[] = [...ENTITY_STORES, "meta", "ops"];

const SHIPMENT_INDEXED: EntityStore[] = [
  "milestones",
  "requirements",
  "documents",
  "tasks",
  "exceptions",
  "fundingRequests",
  "notifications",
  "receipts",
  "disbursements",
  "invoices",
  "costs",
  "activity",
];

export class StorageUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `Browser storage (IndexedDB) is unavailable: ${detail}. DFOS keeps demonstration data in this browser, ` +
        "so it cannot run without it. Leave private/incognito mode, allow site data for this origin, or try another browser profile.",
    );
    this.name = "StorageUnavailableError";
  }
}

let dbName = "dfos-demo";
let dbPromise: Promise<IDBPDatabase> | null = null;
let readyPromise: Promise<IDBPDatabase> | null = null;
let seedFactory: (now: Date) => SeedData = buildSeed;

/** Test hook: use an isolated database (never the presenter's `dfos-demo`). */
export function configureDb(opts: { name: string; seed?: (now: Date) => SeedData }) {
  dbName = opts.name;
  if (opts.seed) seedFactory = opts.seed;
  dbPromise = null;
  readyPromise = null;
}

export function currentDbName() {
  return dbName;
}

/** Closes the cached connection (tests use this to prove data survives a reopen). */
export async function closeDb() {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
  }
  dbPromise = null;
  readyPromise = null;
}

function open(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new StorageUnavailableError("indexedDB is not defined"));
  dbPromise ??= openDB(dbName, SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        for (const name of ENTITY_STORES) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          if (SHIPMENT_INDEXED.includes(name)) store.createIndex("shipmentId", "shipmentId");
        }
        db.createObjectStore("meta", { keyPath: "key" });
        db.createObjectStore("ops", { keyPath: "id" });
      }
    },
    blocked() {
      // An older tab holds a previous schema version open.
      console.warn("DFOS database upgrade is waiting for other DFOS tabs to close.");
    },
    terminated() {
      dbPromise = null;
      readyPromise = null;
    },
  }).catch((e: unknown) => {
    dbPromise = null;
    throw new StorageUnavailableError(e instanceof Error ? e.message : String(e));
  });
  return dbPromise;
}

export async function writeSeed(db: IDBPDatabase, seed: SeedData, clearFirst: boolean) {
  const tx = db.transaction(ALL_STORES, "readwrite");
  tx.done.catch(() => {});
  try {
    if (clearFirst) for (const s of ALL_STORES) await tx.objectStore(s).clear();
    else if (await tx.objectStore("meta").get("seed")) {
      await tx.done; // another tab or an earlier start already seeded: keep existing data
      return false;
    }
    for (const s of ENTITY_STORES) {
      const rows = seed[s] as { id: string }[];
      for (const row of rows) await tx.objectStore(s).put(row);
    }
    await tx.objectStore("meta").put({ key: "seed", seededAt: seed.seededAt, schemaVersion: SCHEMA_VERSION });
    await tx.done;
    return true;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    throw e;
  }
}

/**
 * Opens the database and seeds it only if it has never been seeded.
 * Safe to call any number of times, from any number of tabs.
 */
export function ready(): Promise<IDBPDatabase> {
  readyPromise ??= (async () => {
    const db = await open();
    await writeSeed(db, seedFactory(new Date()), false);
    return db;
  })().catch((e) => {
    readyPromise = null;
    throw e;
  });
  return readyPromise;
}

/** Explicit, confirmed demo reset: clears every store and reseeds in ONE transaction. */
export async function resetDatabase(now = new Date()) {
  const db = await open();
  await writeSeed(db, seedFactory(now), true);
  readyPromise = Promise.resolve(db);
}

export async function seedInfo(): Promise<{ seededAt: string; schemaVersion: number } | null> {
  const db = await ready();
  return (await db.get("meta", "seed")) ?? null;
}
