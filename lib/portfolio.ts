import "server-only";
import { unstable_cache } from "next/cache";
import { snaptrade } from "@/lib/snaptrade";

export type Position = {
  accountId: string;
  accountName: string;
  symbol: string;
  name: string;
  kind: string;
  units: number;
  price: number;
  value: number;
  costBasis: number | null;
  // Broker already counts these inside the account's cash balance.
  cashEquivalent: boolean;
};

export type Holding = {
  symbol: string;
  name: string;
  kind: string;
  units: number;
  price: number;
  value: number;
  cashEquivalent: boolean;
  accounts: { accountId: string; accountName: string; units: number; value: number }[];
};

export type AccountSummary = {
  id: string;
  name: string;
  institution: string;
  number: string;
  cash: number;
  reportedTotal: number | null;
};

export type Portfolio = {
  accounts: AccountSummary[];
  positions: Position[];
  holdings: Holding[];
  cash: number;
  totalValue: number;
  reportedTotal: number;
  asOf: string | null;
  fetchedAt: string;
  warnings: string[];
};

const num = (s: string | null | undefined) => (s == null || s === "" ? NaN : Number(s));

export function errMessage(e: unknown) {
  const err = e as { message?: string; responseBody?: unknown };
  const body = err.responseBody ? ` ${JSON.stringify(err.responseBody)}` : "";
  return `${err.message ?? String(e)}${body}`;
}

// Throws if any SnapTrade call fails, so a partial result is never cached or shown as complete.
async function fetchPortfolio(): Promise<Portfolio> {
  const { data: rawAccounts } = await snaptrade.accountInformation.listUserAccounts();
  const warnings: string[] = [];
  const accounts: AccountSummary[] = [];
  const positions: Position[] = [];
  let asOf: string | null = null;

  // Sequential on purpose: parallel bursts trigger SnapTrade's rate limit.
  for (const a of rawAccounts) {
    const accountName = a.name ?? a.number;
    const call = async <T,>(what: string, p: Promise<T>) => {
      try {
        return await p;
      } catch (e) {
        throw new Error(`${accountName}: ${what} failed: ${errMessage(e)}`);
      }
    };

    const { data: pos } = await call("positions", snaptrade.accountInformation.getAllAccountPositions({ accountId: a.id }));
    const { data: balances } = await call("balances", snaptrade.accountInformation.getUserAccountBalance({ accountId: a.id }));

    let cash = 0;
    for (const b of balances) {
      if (b.currency?.code && b.currency.code !== "USD") {
        warnings.push(`${accountName}: ignored ${b.currency.code} cash balance (no currency conversion).`);
        continue;
      }
      cash += b.cash ?? 0;
    }

    const freshness = pos.data_freshness?.as_of;
    if (freshness && (!asOf || freshness > asOf)) asOf = freshness;
    for (const p of pos.results) {
      const units = num(p.units);
      const price = num(p.price);
      const symbol = p.instrument?.symbol ?? "?";
      if (!Number.isFinite(units) || !Number.isFinite(price)) {
        warnings.push(`${accountName}: ${symbol} skipped (units/price missing).`);
        continue;
      }
      if (p.currency && p.currency !== "USD") {
        warnings.push(`${accountName}: ${symbol} skipped (${p.currency}, no currency conversion).`);
        continue;
      }
      const costBasis = num(p.cost_basis);
      positions.push({
        accountId: a.id,
        accountName,
        symbol,
        name: p.instrument?.description ?? symbol,
        kind: p.instrument?.kind ?? "unknown",
        units,
        price,
        value: units * price,
        costBasis: Number.isFinite(costBasis) ? costBasis : null,
        cashEquivalent: p.cash_equivalent === true,
      });
    }

    accounts.push({
      id: a.id,
      name: accountName,
      institution: a.institution_name,
      number: a.number,
      cash,
      reportedTotal: a.balance?.total?.amount ?? null,
    });
  }

  const bySymbol = new Map<string, Holding>();
  for (const p of positions) {
    const h = bySymbol.get(p.symbol) ?? {
      symbol: p.symbol,
      name: p.name,
      kind: p.kind,
      units: 0,
      price: p.price,
      value: 0,
      cashEquivalent: p.cashEquivalent,
      accounts: [],
    };
    h.units += p.units;
    h.value += p.value;
    h.accounts.push({ accountId: p.accountId, accountName: p.accountName, units: p.units, value: p.value });
    bySymbol.set(p.symbol, h);
  }
  const holdings = [...bySymbol.values()].sort((a, b) => b.value - a.value);

  const cash = accounts.reduce((s, a) => s + a.cash, 0);
  const investedValue = holdings.filter((h) => !h.cashEquivalent).reduce((s, h) => s + h.value, 0);
  const reportedTotal = accounts.reduce((s, a) => s + (a.reportedTotal ?? 0), 0);

  return {
    accounts,
    positions,
    holdings,
    cash,
    totalValue: investedValue + cash,
    reportedTotal,
    asOf,
    fetchedAt: new Date().toISOString(),
    warnings,
  };
}

// Personal SnapTrade keys hit 429s quickly; the Sandbox is static, so a 5-minute server cache is safe.
export const getPortfolio = unstable_cache(fetchPortfolio, ["snaptrade-portfolio"], { revalidate: 300 });
