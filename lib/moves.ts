import "server-only";
import { getMoves } from "@/lib/marketdata";
import type { Portfolio } from "@/lib/portfolio";
import { readCloses } from "@/lib/store";
import type { XRay } from "@/lib/xray";

export type Period = "day" | "week";

export type HoldingMove = {
  symbol: string;
  name: string;
  units: number;
  valueUsd: number;
  pctMove: number | null;
  priceChange: number | null;
  impactUsd: number | null;
  shareOfMovement: number | null; // impact / sum of |impact| across priced holdings
  since: string | null;
  source: string | null;
  // Other routes into the same company via funds (look-through).
  alsoVia: { fund: string; accountName: string; valueUsd: number }[];
};

export type MovesReport = {
  period: Period;
  source: string;
  netImpactUsd: number;
  grossMovementUsd: number;
  pricedValueUsd: number;
  unpricedSymbols: string[];
  holdings: HoldingMove[];
  topDrivers: string[];
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// Kinds with US-ticker price history (used for the value-history line).
export const PRICEABLE_KINDS = new Set(["stock", "etf", "mutualfund"]);

// Crypto tickers collide with unrelated US listings (e.g. ETH), so query explicit crypto symbols instead.
function providerSymbol(symbol: string, kind: string, period: Period) {
  if (kind !== "crypto") return symbol;
  return period === "day" ? `BINANCE:${symbol}USDT` : `CRYPTO:${symbol}`;
}

type Quote = { change: number; changePct: number; startDate?: string; source: string };

// Finnhub's free quote has no mutual funds; their last two published closes give the latest daily move.
async function lastCloseMove(symbol: string): Promise<Quote | null> {
  const closes = await readCloses(symbol, new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10));
  if (closes.length < 2) return null;
  const [prev, last] = closes.slice(-2);
  return {
    change: last.close - prev.close,
    changePct: ((last.close - prev.close) / prev.close) * 100,
    startDate: prev.date,
    source: `Alpha Vantage close ${last.date}`,
  };
}

export async function computeMoves(portfolio: Portfolio, xray: XRay, period: Period): Promise<MovesReport> {
  const held = portfolio.holdings.filter((h) => !h.cashEquivalent);
  // Finnhub's free plan rejects mutual funds (HTTP 403); they use their last published close instead.
  const queried = held.filter((h) => !(period === "day" && h.kind === "mutualfund"));
  const querySymbol = new Map(queried.map((h) => [h.symbol, providerSymbol(h.symbol, h.kind, period)]));
  const quotes = await getMoves([...querySymbol.values()], period as "day");
  const providerName = period === "day" ? "Finnhub" : "Alpha Vantage";

  const companyOf = new Map<string, string>();
  for (const e of xray.exposures) for (const c of e.contributions) if (c.via !== "direct") companyOf.set(c.heldSymbol, e.key);

  const fundFallback = new Map<string, Quote | null>();
  if (period === "day")
    for (const h of held) if (h.kind === "mutualfund") fundFallback.set(h.symbol, await lastCloseMove(h.symbol));

  const rows = held.map((h) => {
    const query = querySymbol.get(h.symbol);
    const raw = (query ? quotes[query] : null) as { change: number; changePct: number; startDate?: string } | null;
    const q: Quote | null = raw
      ? { ...raw, source: providerName }
      : period === "day" && h.kind === "mutualfund"
        ? (fundFallback.get(h.symbol) ?? null)
        : null;
    const exposure = xray.exposures.find((e) => e.key === companyOf.get(h.symbol));
    const routes = new Map<string, { fund: string; accountName: string; valueUsd: number }>();
    for (const c of exposure?.contributions ?? []) {
      if (c.via === "direct") continue;
      const k = `${c.via}|${c.accountName}`;
      const r = routes.get(k) ?? { fund: c.via, accountName: c.accountName, valueUsd: 0 };
      r.valueUsd = round(r.valueUsd + c.value);
      routes.set(k, r);
    }
    return {
      symbol: h.symbol,
      name: h.name,
      units: h.units,
      valueUsd: round(h.value),
      pctMove: q ? round(q.changePct) : null,
      priceChange: q ? round(q.change, 4) : null,
      impactUsd: q ? round(h.units * q.change) : null,
      shareOfMovement: null as number | null,
      since: q?.startDate ?? null,
      source: q?.source ?? null,
      alsoVia: [...routes.values()],
    };
  });

  const priced = rows.filter((r) => r.impactUsd !== null);
  const gross = priced.reduce((s, r) => s + Math.abs(r.impactUsd!), 0);
  for (const r of priced) r.shareOfMovement = gross > 0 ? round((Math.abs(r.impactUsd!) / gross) * 100, 1) : 0;

  const topDrivers = [...priced]
    .sort((a, b) => Math.abs(b.impactUsd!) - Math.abs(a.impactUsd!))
    .slice(0, 3)
    .map((r) => r.symbol);

  return {
    period,
    source: providerName,
    netImpactUsd: round(priced.reduce((s, r) => s + r.impactUsd!, 0)),
    grossMovementUsd: round(gross),
    pricedValueUsd: round(priced.reduce((s, r) => s + r.valueUsd, 0)),
    unpricedSymbols: rows.filter((r) => r.impactUsd === null).map((r) => r.symbol),
    holdings: rows.sort((a, b) => Math.abs(b.impactUsd ?? 0) - Math.abs(a.impactUsd ?? 0)),
    topDrivers,
  };
}
