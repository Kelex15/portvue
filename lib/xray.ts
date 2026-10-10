import type { Portfolio, Position } from "@/lib/portfolio";

export type FundSnapshot = {
  name: string;
  asOf: string;
  source: string;
  sourceUrl: string;
  holdings: { symbol: string; company: string; name: string; weight: number }[];
};
export type FundData = Record<string, FundSnapshot>;

export type Contribution = {
  via: "direct" | string; // "direct" or the fund symbol
  heldSymbol: string;
  accountName: string;
  value: number;
  fundWeight?: number;
  fundValue?: number;
};

export type Exposure = {
  key: string;
  label: string;
  kind: string;
  value: number;
  pct: number;
  contributions: Contribution[];
};

export type FundRemainder = {
  fund: string;
  accountName: string;
  fundValue: number;
  coveredWeight: number;
  value: number;
};

export type Finding = {
  id: string;
  title: string;
  summary: string;
  exposureKeys: string[];
  numbers: Record<string, number | string | string[]>;
};

export type XRay = {
  totalValue: number;
  cash: number;
  exposures: Exposure[];
  remainders: FundRemainder[];
  unknownValue: number;
  fundsUsed: (Omit<FundSnapshot, "holdings"> & { symbol: string; coveredWeight: number })[];
  findings: Finding[];
};

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const pct1 = (fraction: number) => round(fraction * 100, 1);
const pathKey = (c: Contribution) => `${c.via}|${c.accountName}`;

export function lookThrough(portfolio: Portfolio, funds: FundData): XRay {
  const { totalValue, cash } = portfolio;
  const companyBySymbol = new Map<string, string>();
  for (const f of Object.values(funds)) for (const h of f.holdings) companyBySymbol.set(h.symbol, h.company);

  const exposures = new Map<string, Exposure>();
  const add = (key: string, label: string, kind: string, c: Contribution) => {
    const e = exposures.get(key) ?? { key, label, kind, value: 0, pct: 0, contributions: [] };
    e.value += c.value;
    e.contributions.push(c);
    exposures.set(key, e);
  };

  const remainders: FundRemainder[] = [];
  const invested = portfolio.positions.filter((p: Position) => !p.cashEquivalent);

  for (const p of invested) {
    const fund = funds[p.symbol];
    if (!fund) {
      const company = companyBySymbol.get(p.symbol);
      add(company ?? p.symbol, company ?? p.name, p.kind, {
        via: "direct",
        heldSymbol: p.symbol,
        accountName: p.accountName,
        value: p.value,
      });
      continue;
    }
    let covered = 0;
    for (const h of fund.holdings) {
      covered += h.weight;
      add(h.company, h.company, "stock", {
        via: p.symbol,
        heldSymbol: h.symbol,
        accountName: p.accountName,
        value: p.value * h.weight,
        fundWeight: h.weight,
        fundValue: p.value,
      });
    }
    remainders.push({
      fund: p.symbol,
      accountName: p.accountName,
      fundValue: p.value,
      coveredWeight: covered,
      value: p.value * (1 - covered),
    });
  }

  const list = [...exposures.values()]
    .map((e) => ({ ...e, pct: e.value / totalValue }))
    .sort((a, b) => b.value - a.value);
  const unknownValue = remainders.reduce((s, r) => s + r.value, 0);

  const heldFunds = new Set(remainders.map((r) => r.fund));
  const fundsUsed = [...heldFunds].map((symbol) => {
    const { holdings, ...meta } = funds[symbol];
    return { symbol, ...meta, coveredWeight: holdings.reduce((s, h) => s + h.weight, 0) };
  });

  return {
    totalValue,
    cash,
    exposures: list,
    remainders,
    unknownValue,
    fundsUsed,
    findings: computeFindings(list, remainders, funds, totalValue, cash, unknownValue),
  };
}

function computeFindings(
  exposures: Exposure[],
  remainders: FundRemainder[],
  funds: FundData,
  totalValue: number,
  cash: number,
  unknownValue: number,
): Finding[] {
  const findings: Finding[] = [];
  const paths = (e: Exposure) => new Set(e.contributions.map(pathKey)).size;
  const viaFunds = (e: Exposure) => e.contributions.filter((c) => c.via !== "direct");
  const accountsOf = (e: Exposure) => [...new Set(e.contributions.map((c) => c.accountName))];

  const top = exposures[0];
  if (top) {
    findings.push({
      id: "largest-exposure",
      title: "Largest single exposure",
      summary: `${top.label} is ${pct1(top.pct)}% of the portfolio.`,
      exposureKeys: [top.key],
      numbers: { name: top.label, valueUsd: round(top.value), pctOfPortfolio: pct1(top.pct), paths: paths(top) },
    });
  }

  const companies = exposures.filter((e) => viaFunds(e).length > 0);
  const topCompany = companies[0];
  if (topCompany && topCompany !== top) {
    findings.push({
      id: "largest-company",
      title: "Largest company exposure (look-through)",
      summary: `${topCompany.label} is ${pct1(topCompany.pct)}% once funds are looked through.`,
      exposureKeys: [topCompany.key],
      numbers: {
        name: topCompany.label,
        valueUsd: round(topCompany.value),
        pctOfPortfolio: pct1(topCompany.pct),
        paths: paths(topCompany),
      },
    });
  }

  const overlaps = companies
    .filter((e) => paths(e) >= 2)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  for (const e of overlaps) {
    const direct = e.contributions.filter((c) => c.via === "direct").reduce((s, c) => s + c.value, 0);
    const indirect = viaFunds(e).reduce((s, c) => s + c.value, 0);
    findings.push({
      id: `overlap-${e.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `Hidden overlap: ${e.label}`,
      summary: `${e.label} reaches you through ${paths(e)} paths across ${accountsOf(e).length} account(s).`,
      exposureKeys: [e.key],
      numbers: {
        name: e.label,
        totalUsd: round(e.value),
        pctOfPortfolio: pct1(e.pct),
        directUsd: round(direct),
        viaFundsUsd: round(indirect),
        directSharePctOfThisExposure: pct1(direct / e.value),
        viaFundsSharePctOfThisExposure: pct1(indirect / e.value),
        paths: paths(e),
        routes: [...new Set(e.contributions.map((c) => (c.via === "direct" ? `direct ${c.heldSymbol}` : `via ${c.via}`) + ` in ${c.accountName}`))],
      },
    });
  }

  // Funds whose snapshots share companies: same exposure bought twice under different tickers.
  const fundSymbols = [...new Set(remainders.map((r) => r.fund))];
  for (let i = 0; i < fundSymbols.length; i++) {
    for (let j = i + 1; j < fundSymbols.length; j++) {
      const a = funds[fundSymbols[i]];
      const b = funds[fundSymbols[j]];
      const wb = new Map(b.holdings.map((h) => [h.symbol, h.weight]));
      const shared = a.holdings.filter((h) => wb.has(h.symbol));
      const overlapWeight = shared.reduce((s, h) => s + Math.min(h.weight, wb.get(h.symbol)!), 0);
      const fundValue = (sym: string) => remainders.filter((r) => r.fund === sym).reduce((s, r) => s + r.fundValue, 0);
      const combined = fundValue(fundSymbols[i]) + fundValue(fundSymbols[j]);
      findings.push({
        id: `fund-overlap-${fundSymbols[i].toLowerCase()}-${fundSymbols[j].toLowerCase()}`,
        title: `${fundSymbols[i]} and ${fundSymbols[j]} hold the same companies`,
        summary: `${shared.length} of the top ${a.holdings.length} holdings are shared; together the two funds are ${pct1(combined / totalValue)}% of the portfolio.`,
        exposureKeys: [...new Set(shared.map((h) => h.company))],
        numbers: {
          fundA: fundSymbols[i],
          fundB: fundSymbols[j],
          sharedTopHoldings: shared.length,
          snapshotSize: a.holdings.length,
          overlapWeightWithinSnapshots: pct1(overlapWeight),
          combinedFundsUsd: round(combined),
          combinedFundsPctOfPortfolio: pct1(combined / totalValue),
          fundAAsOf: a.asOf,
          fundBAsOf: b.asOf,
        },
      });
    }
  }

  const top3 = exposures.slice(0, 3);
  const top3Value = top3.reduce((s, e) => s + e.value, 0);
  findings.push({
    id: "top3-concentration",
    title: "Top-3 concentration",
    summary: `The three largest exposures make up ${pct1(top3Value / totalValue)}% of the portfolio.`,
    exposureKeys: top3.map((e) => e.key),
    numbers: {
      names: top3.map((e) => e.label),
      combinedUsd: round(top3Value),
      pctOfPortfolio: pct1(top3Value / totalValue),
    },
  });

  findings.push({
    id: "cash-share",
    title: "Cash share",
    summary: `Cash and cash equivalents are ${pct1(cash / totalValue)}% of the portfolio.`,
    exposureKeys: [],
    numbers: { cashUsd: round(cash), pctOfPortfolio: pct1(cash / totalValue) },
  });

  findings.push({
    id: "unknown-remainder",
    title: "Share of the whole portfolio held in fund holdings outside the snapshot",
    summary: `${pct1(unknownValue / totalValue)}% of the portfolio sits in fund holdings outside the top-holdings snapshot, so look-through figures are lower bounds.`,
    exposureKeys: [],
    numbers: { unknownUsd: round(unknownValue), pctOfPortfolio: pct1(unknownValue / totalValue) },
  });

  return findings;
}
