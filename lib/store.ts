import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

// Turso in production, so every instance shares one persistent store; a local SQLite file in development.
function databaseUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (process.env.VERCEL) throw new Error("TURSO_DATABASE_URL is not set; the deployment has no persistent store.");
  const file = path.join(process.cwd(), "data", "portvue.db");
  mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file}`;
}

const SCHEMA = `
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
  CREATE TABLE IF NOT EXISTS ai_calls (
    bucket  TEXT NOT NULL,
    client  TEXT NOT NULL,
    at      INTEGER NOT NULL      -- epoch ms
  );
  CREATE INDEX IF NOT EXISTS ai_calls_lookup ON ai_calls (bucket, client, at);
`;

// One client per server process; dev hot reloads re-evaluate modules, so keep it on globalThis.
const holder = globalThis as unknown as { __portvueDb?: Promise<Client> };

function db(): Promise<Client> {
  holder.__portvueDb ??= (async () => {
    const client = createClient({ url: databaseUrl(), authToken: process.env.TURSO_AUTH_TOKEN });
    await client.executeMultiple(SCHEMA);
    return client;
  })();
  return holder.__portvueDb;
}

// Market date, so a late-evening reload in another timezone still reuses the same day's rows.
export function marketDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// undefined = not stored; null = stored "no data".
export async function readMove<T>(provider: string, symbol: string, date = marketDate()): Promise<T | null | undefined> {
  const { rows } = await (await db()).execute({
    sql: "SELECT payload FROM market_moves WHERE provider = ? AND symbol = ? AND market_date = ?",
    args: [provider, symbol, date],
  });
  if (rows.length === 0) return undefined;
  const payload = rows[0].payload as string | null;
  return payload === null ? null : (JSON.parse(payload) as T);
}

export async function writeMove(provider: string, symbol: string, move: unknown, date = marketDate()) {
  await (await db()).execute({
    sql: `INSERT INTO market_moves (provider, symbol, market_date, payload, fetched_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    args: [provider, symbol, date, move === null ? null : JSON.stringify(move), new Date().toISOString()],
  });
}

export async function writeCloses(symbol: string, closes: { date: string; close: number }[], source: string) {
  await (await db()).batch(
    closes.map((c) => ({
      sql: `INSERT INTO price_history (symbol, date, close, source) VALUES (?, ?, ?, ?)
            ON CONFLICT DO UPDATE SET close = excluded.close, source = excluded.source`,
      args: [symbol, c.date, c.close, source],
    })),
    "write",
  );
}

export async function readCloses(symbol: string, sinceDate: string): Promise<{ date: string; close: number }[]> {
  const { rows } = await (await db()).execute({
    sql: "SELECT date, close FROM price_history WHERE symbol = ? AND date >= ? ORDER BY date",
    args: [symbol, sinceDate],
  });
  return rows.map((r) => ({ date: r.date as string, close: Number(r.close) }));
}

export async function readDrivers<T>(period: string, driverSet: string, date = marketDate()): Promise<T | undefined> {
  const { rows } = await (await db()).execute({
    sql: "SELECT payload FROM news_drivers WHERE period = ? AND market_date = ? AND driver_set = ?",
    args: [period, date, driverSet],
  });
  return rows.length > 0 ? (JSON.parse(rows[0].payload as string) as T) : undefined;
}

export async function writeDrivers(period: string, driverSet: string, payload: unknown, date = marketDate()) {
  await (await db()).execute({
    sql: `INSERT INTO news_drivers (period, market_date, driver_set, payload, fetched_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    args: [period, date, driverSet, JSON.stringify(payload), new Date().toISOString()],
  });
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Sliding-window limit on paid AI calls. Records the call only when it is allowed; the check and the
// insert share one write transaction so concurrent requests can't both slip under the limit.
export async function takeAiCall(
  bucket: string,
  client: string,
  limits: { perHour: number; perDay: number; globalPerDay: number },
): Promise<{ ok: true } | { ok: false; scope: "global" | "client"; retryAfterSec: number }> {
  const tx = await (await db()).transaction("write");
  try {
    const now = Date.now();
    await tx.execute({ sql: "DELETE FROM ai_calls WHERE at < ?", args: [now - DAY] });

    // Safety net across all visitors, so many IPs together can't run up the bill.
    const global = (await tx.execute({ sql: "SELECT COUNT(*) AS n, MIN(at) AS first FROM ai_calls WHERE bucket = ?", args: [bucket] }))
      .rows[0];
    if (Number(global.n) >= limits.globalPerDay) {
      await tx.commit();
      return { ok: false, scope: "global", retryAfterSec: Math.ceil((Number(global.first) + DAY - now) / 1000) };
    }

    const times = (
      await tx.execute({ sql: "SELECT at FROM ai_calls WHERE bucket = ? AND client = ? ORDER BY at", args: [bucket, client] })
    ).rows.map((r) => Number(r.at));
    const lastHour = times.filter((t) => t > now - HOUR);
    if (lastHour.length >= limits.perHour) {
      await tx.commit();
      return { ok: false, scope: "client", retryAfterSec: Math.ceil((lastHour[0] + HOUR - now) / 1000) };
    }
    if (times.length >= limits.perDay) {
      await tx.commit();
      return { ok: false, scope: "client", retryAfterSec: Math.ceil((times[0] + DAY - now) / 1000) };
    }

    await tx.execute({ sql: "INSERT INTO ai_calls (bucket, client, at) VALUES (?, ?, ?)", args: [bucket, client, now] });
    await tx.commit();
    return { ok: true };
  } finally {
    tx.close();
  }
}
