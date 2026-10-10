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
  const held = portfolio.holdings.filter((h) => !h.cashEquivalent && (PRICEABLE_KINDS.has(h.kind) || h.kind === "crypto"));
  // Crypto closes are stored under the provider symbol used for weekly moves.
  const historySymbol = (h: (typeof held)[number]) => (h.kind === "crypto" ? `CRYPTO:${h.symbol}` : h.symbol);
  // Fills price_history as a side effect (one Alpha Vantage call per ticker per market day).
  await getMoves(held.map(historySymbol), "week");

  const since = new Date(Date.now() - days * 2 * 86_400_000).toISOString().slice(0, 10);
  const series: HistoryReport["series"] = {};
  for (const h of held) {
    const closes = await readCloses(historySymbol(h), since);
    if (closes.length > 0) series[h.symbol] = closes;
  }
  const symbols = Object.keys(series);
  const missingSymbols = held.map((h) => h.symbol).filter((s) => !series[s]);

  // Plot on stock trading days (crypto also trades weekends); funds publish NAV a day late, so carry each
  // symbol's last known close forward across dates.
  const stockSymbols = held.filter((h) => h.kind !== "crypto" && series[h.symbol]).map((h) => h.symbol);
  const dateSource = stockSymbols.length > 0 ? stockSymbols : symbols;
  const dates = [...new Set(dateSource.flatMap((s) => series[s].map((c) => c.date)))].sort().slice(-days);
  const last: Record<string, number | undefined> = {};
  const value: HistoryReport["value"] = [];
  const sortedAll = Object.fromEntries(symbols.map((s) => [s, series[s]]));
  for (const date of dates) {
    for (const s of symbols) {
      // Latest close on or before this date (covers weekend crypto rows and fund lag).
      for (const c of sortedAll[s]) if (c.date <= date) last[s] = c.close;
    }
    if (symbols.some((s) => last[s] === undefined)) continue;
    // Cash is held constant at today's balance.
    const invested = held.filter((h) => series[h.symbol]).reduce((sum, h) => sum + h.units * last[h.symbol]!, 0);
    value.push({ date, value: round(invested + portfolio.cash) });
  }

  // Sparklines share the chart's window.
  const from = value[0]?.date ?? "";
  for (const sym of symbols) series[sym] = series[sym].filter((c) => c.date >= from);

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
