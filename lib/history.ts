import "server-only";
import { getMoves } from "@/lib/marketdata";
import { PRICEABLE_KINDS } from "@/lib/moves";
import type { Portfolio } from "@/lib/portfolio";
import { readCloses } from "@/lib/store";

export type HistoryReport = {
  days: number;
  source: string;
  series: Record<string, { date: string; close: number }[]>;
  value: { date: string; value: number }[];
  symbols: string[];
  missingSymbols: string[];
  startValue: number | null;
  endValue: number | null;
  changeUsd: number | null;
  changePct: number | null;
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export async function computeHistory(portfolio: Portfolio, days = 90): Promise<HistoryReport> {
  const held = portfolio.holdings.filter((h) => !h.cashEquivalent && PRICEABLE_KINDS.has(h.kind));
  // Fills price_history as a side effect (one Alpha Vantage call per ticker per market day).
  await getMoves(held.map((h) => h.symbol), "week");

  const since = new Date(Date.now() - days * 2 * 86_400_000).toISOString().slice(0, 10);
  const series: HistoryReport["series"] = {};
  for (const h of held) {
    const closes = readCloses(h.symbol, since);
    if (closes.length > 0) series[h.symbol] = closes.slice(-days);
  }
  const symbols = Object.keys(series);
  const missingSymbols = held.map((h) => h.symbol).filter((s) => !series[s]);

  // Funds publish NAV a day late, so carry each symbol's last known close forward across dates.
  const dates = [...new Set(symbols.flatMap((s) => series[s].map((c) => c.date)))].sort().slice(-days);
  const last: Record<string, number | undefined> = {};
  const byDate = Object.fromEntries(symbols.map((s) => [s, new Map(series[s].map((c) => [c.date, c.close]))]));
  const value: HistoryReport["value"] = [];
  for (const date of dates) {
    for (const s of symbols) last[s] = byDate[s].get(date) ?? last[s];
    if (symbols.some((s) => last[s] === undefined)) continue;
    value.push({ date, value: round(held.filter((h) => series[h.symbol]).reduce((sum, h) => sum + h.units * last[h.symbol]!, 0)) });
  }

  const startValue = value[0]?.value ?? null;
  const endValue = value.at(-1)?.value ?? null;
  const changeUsd = startValue !== null && endValue !== null ? round(endValue - startValue) : null;
  return {
    days,
    source: "Alpha Vantage",
    series,
    value,
    symbols,
    missingSymbols,
    startValue,
    endValue,
    changeUsd,
    changePct: changeUsd !== null && startValue ? round((changeUsd / startValue) * 100) : null,
  };
}
