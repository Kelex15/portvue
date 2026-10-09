import "server-only";
import { getMoves } from "@/lib/marketdata";
import type { Portfolio } from "@/lib/portfolio";
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

// Market-data sources are queried by US ticker; crypto symbols there collide with unrelated listings (e.g. ETH).
export const PRICEABLE_KINDS = new Set(["stock", "etf", "mutualfund"]);

export async function computeMoves(portfolio: Portfolio, xray: XRay, period: Period): Promise<MovesReport> {
  const held = portfolio.holdings.filter((h) => !h.cashEquivalent);
  const quotes = await getMoves(
    held.filter((h) => PRICEABLE_KINDS.has(h.kind)).map((h) => h.symbol),
    period as "day",
  );

  const companyOf = new Map<string, string>();
  for (const e of xray.exposures) for (const c of e.contributions) if (c.via !== "direct") companyOf.set(c.heldSymbol, e.key);

  const rows = held.map((h) => {
    const q = (quotes[h.symbol] ?? null) as { change: number; changePct: number; startDate?: string } | null;
    const exposure = xray.exposures.find((e) => e.key === companyOf.get(h.symbol));
    const routes = new Map<string, { fund: string; accountName: string; valueUsd: number }>();
    for (const c of exposure?.contributions ?? []) {
      if (c.via === "direct") continue;
      const k = `${c.via}|${c.accountName}`;
      const r = routes.get(k) ?? { fund: c.via, accountName: c.accountName, valueUsd: 0 };
      r.valueUsd = round(r.valueUsd + c.value);
      routes.set(k, r);
    }
    const alsoVia = [...routes.values()];
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
      alsoVia,
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
    source: period === "day" ? "Finnhub" : "Alpha Vantage",
    netImpactUsd: round(priced.reduce((s, r) => s + r.impactUsd!, 0)),
    grossMovementUsd: round(gross),
    pricedValueUsd: round(priced.reduce((s, r) => s + r.valueUsd, 0)),
    unpricedSymbols: rows.filter((r) => r.impactUsd === null).map((r) => r.symbol),
    holdings: rows.sort((a, b) => Math.abs(b.impactUsd ?? 0) - Math.abs(a.impactUsd ?? 0)),
    topDrivers,
  };
}
