import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = path.join(process.cwd(), "data", "portvue.db");

// One connection per server process; dev hot reloads re-evaluate modules, so keep it on globalThis.
const holder = globalThis as unknown as { __portvueDb?: DatabaseSync };

function db(): DatabaseSync {
  if (holder.__portvueDb) return holder.__portvueDb;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new DatabaseSync(DB_PATH);
  conn.exec(`
    CREATE TABLE IF NOT EXISTS market_moves (
      provider    TEXT NOT NULL,
      symbol      TEXT NOT NULL,
      market_date TEXT NOT NULL,
      payload     TEXT,            -- JSON; NULL = provider has no data for this symbol
      fetched_at  TEXT NOT NULL,
      PRIMARY KEY (provider, symbol, market_date)
    );
    CREATE TABLE IF NOT EXISTS price_history (
      symbol     TEXT NOT NULL,
      date       TEXT NOT NULL,
      close      REAL NOT NULL,
      source     TEXT NOT NULL,
      PRIMARY KEY (symbol, date)
    );
    CREATE TABLE IF NOT EXISTS news_drivers (
      period      TEXT NOT NULL,
      market_date TEXT NOT NULL,
      driver_set  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      fetched_at  TEXT NOT NULL,
      PRIMARY KEY (period, market_date, driver_set)
    );
  `);
  holder.__portvueDb = conn;
  return conn;
}

// Market date, so a late-evening reload in another timezone still reuses the same day's rows.
export function marketDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// undefined = not stored; null = stored "no data".
export function readMove<T>(provider: string, symbol: string, date = marketDate()): T | null | undefined {
  const row = db()
    .prepare("SELECT payload FROM market_moves WHERE provider = ? AND symbol = ? AND market_date = ?")
    .get(provider, symbol, date) as { payload: string | null } | undefined;
  if (!row) return undefined;
  return row.payload === null ? null : (JSON.parse(row.payload) as T);
}

export function writeMove(provider: string, symbol: string, move: unknown, date = marketDate()) {
  db()
    .prepare(
      `INSERT INTO market_moves (provider, symbol, market_date, payload, fetched_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    )
    .run(provider, symbol, date, move === null ? null : JSON.stringify(move), new Date().toISOString());
}

export function writeCloses(symbol: string, closes: { date: string; close: number }[], source: string) {
  const conn = db();
  const stmt = conn.prepare(
    `INSERT INTO price_history (symbol, date, close, source) VALUES (?, ?, ?, ?)
     ON CONFLICT DO UPDATE SET close = excluded.close, source = excluded.source`,
  );
  conn.exec("BEGIN");
  try {
    for (const c of closes) stmt.run(symbol, c.date, c.close, source);
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

export function readCloses(symbol: string, sinceDate: string): { date: string; close: number }[] {
  return db()
    .prepare("SELECT date, close FROM price_history WHERE symbol = ? AND date >= ? ORDER BY date")
    .all(symbol, sinceDate) as { date: string; close: number }[];
}

export function readDrivers<T>(period: string, driverSet: string, date = marketDate()): T | undefined {
  const row = db()
    .prepare("SELECT payload FROM news_drivers WHERE period = ? AND market_date = ? AND driver_set = ?")
    .get(period, date, driverSet) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as T) : undefined;
}

export function writeDrivers(period: string, driverSet: string, payload: unknown, date = marketDate()) {
  db()
    .prepare(
      `INSERT INTO news_drivers (period, market_date, driver_set, payload, fetched_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    )
    .run(period, date, driverSet, JSON.stringify(payload), new Date().toISOString());
}
