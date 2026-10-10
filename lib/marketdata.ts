import "server-only";
import { marketDate, readMove, writeCloses, writeMove } from "@/lib/store";

export type DailyMove = {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  source: "Finnhub";
};

export type WeeklyMove = {
  symbol: string;
  price: number;
  startPrice: number;
  startDate: string;
  change: number;
  changePct: number;
  source: "Alpha Vantage";
};

export interface MarketDataProvider<T> {
  /** Used in cache file names and logs. */
  readonly id: string;
  readonly envVar: string;
  /** Minimum gap between network calls when fetching many symbols. */
  readonly minIntervalMs: number;
  /** Resolves null when the provider has no data for the symbol (cached); throws on transient failures (not cached). */
  fetchMove(symbol: string, apiKey: string): Promise<T | null>;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export class FinnhubProvider implements MarketDataProvider<DailyMove> {
  readonly id = "finnhub";
  readonly envVar = "FINNHUB_API_KEY";
  readonly minIntervalMs = 1100; // free: 60 calls/min

  async fetchMove(symbol: string, apiKey: string): Promise<DailyMove | null> {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const q = await res.json();
    // Unknown symbols come back as 200 with c=0, pc=0, d/dp=null.
    if (!isNum(q.c) || !isNum(q.pc) || !isNum(q.d) || !isNum(q.dp) || q.c === 0 || q.pc === 0) return null;
    return { symbol, price: q.c, change: q.d, changePct: q.dp, prevClose: q.pc, source: "Finnhub" };
  }
}

export class AlphaVantageProvider implements MarketDataProvider<WeeklyMove> {
  readonly id = "alphavantage";
  readonly envVar = "ALPHAVANTAGE_API_KEY";
  readonly minIntervalMs = 12500; // free: 25 calls/day, and bursts get throttled
  private exhausted = false;

  async fetchMove(symbol: string, apiKey: string): Promise<WeeklyMove | null> {
    if (this.exhausted) throw new Error("rate limited earlier in this process");
    // "CRYPTO:BTC" selects the digital-currency series; crypto trades daily, so a week is 7 rows rather than 5.
    const crypto = symbol.startsWith("CRYPTO:");
    const url = crypto
      ? `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&market=USD&symbol=${encodeURIComponent(symbol.slice(7))}&apikey=${apiKey}`
      : `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=compact&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    // Rate-limit and plan messages arrive as HTTP 200 with "Information" or "Note".
    if (body.Information || body.Note) {
      this.exhausted = true;
      throw new Error(body.Information ?? body.Note);
    }
    if (body["Error Message"]) return null;

    const series = body[crypto ? "Time Series (Digital Currency Daily)" : "Time Series (Daily)"] as
      | Record<string, Record<string, string>>
      | undefined;
    const dates = series ? Object.keys(series).sort().reverse().slice(0, crypto ? 140 : 100) : [];
    const tradingDays = crypto ? 7 : 5;
    if (!series || dates.length <= tradingDays) return null;
    writeCloses(
      symbol,
      dates.map((date) => ({ date, close: Number(series[date]["4. close"]) })).filter((c) => isNum(c.close)),
      "Alpha Vantage",
    );

    const startDate = dates[tradingDays];
    const price = Number(series[dates[0]]["4. close"]);
    const startPrice = Number(series[startDate]["4. close"]);
    if (!isNum(price) || !isNum(startPrice) || price <= 0 || startPrice <= 0) return null;

    const change = price - startPrice;
    return {
      symbol,
      price,
      startPrice,
      startDate,
      change,
      changePct: (change / startPrice) * 100,
      source: "Alpha Vantage",
    };
  }
}

const finnhub = new FinnhubProvider();
const alphaVantage = new AlphaVantageProvider();

const warnedMissingKey = new Set<string>();

async function getMove<T>(provider: MarketDataProvider<T>, symbol: string): Promise<T | null> {
  const stored = readMove<T>(provider.id, symbol);
  if (stored !== undefined) return stored;

  const apiKey = process.env[provider.envVar];
  if (!apiKey) {
    if (!warnedMissingKey.has(provider.id)) {
      warnedMissingKey.add(provider.id);
      console.warn(`[marketdata] ${provider.envVar} is not set; returning null`);
    }
    return null;
  }

  let move: T | null;
  try {
    move = await provider.fetchMove(symbol, apiKey);
  } catch (err) {
    console.warn(`[marketdata] ${provider.id} ${symbol} failed:`, err instanceof Error ? err.message : err);
    return null;
  }

  writeMove(provider.id, symbol, move, marketDate());
  return move;
}

export function getDailyMove(symbol: string): Promise<DailyMove | null> {
  return getMove(finnhub, symbol);
}

export function getWeeklyMove(symbol: string): Promise<WeeklyMove | null> {
  return getMove(alphaVantage, symbol);
}

export async function getMoves(symbols: string[], period: "day"): Promise<Record<string, DailyMove | null>>;
export async function getMoves(symbols: string[], period: "week"): Promise<Record<string, WeeklyMove | null>>;
export async function getMoves(
  symbols: string[],
  period: "day" | "week",
): Promise<Record<string, DailyMove | WeeklyMove | null>> {
  const provider: MarketDataProvider<DailyMove | WeeklyMove> = period === "day" ? finnhub : alphaVantage;
  const out: Record<string, DailyMove | WeeklyMove | null> = {};
  let lastNetworkCall = 0;

  for (const symbol of new Set(symbols)) {
    if (readMove(provider.id, symbol) === undefined) {
      const wait = lastNetworkCall + provider.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastNetworkCall = Date.now();
    }
    out[symbol] = await getMove(provider, symbol);
  }
  return out;
}
