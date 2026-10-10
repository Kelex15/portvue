import type { Finding, XRay } from "@/lib/xray";

export type InsightCategory = "concentration" | "overlap" | "composition" | "data-quality";
export type Severity = "high" | "medium" | "info";

export type Insight = {
  id: string;
  findingId?: string;
  category: InsightCategory;
  severity: Severity;
  title: string;
  body: string;
  figure?: string;
  source: string;
  href: string;
  exposureKey?: string;
};

export const CATEGORY_LABEL: Record<InsightCategory, string> = {
  concentration: "Concentration",
  overlap: "Hidden overlap",
  composition: "Composition",
  "data-quality": "Data quality",
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
const STALE_DAYS = 60;

const exposureHref = (key?: string) => (key ? `/exposure?company=${encodeURIComponent(key)}` : "/exposure");
const n = (f: Finding, k: string) => f.numbers[k] as number;
const pct = (v: number) => `${v.toFixed(1)}%`;

export function toInsights(xray: XRay, today = new Date()): Insight[] {
  const out: Insight[] = [];
  const snapshotSource = xray.fundsUsed.map((f) => `${f.symbol} snapshot ${f.asOf}`).join(", ");

  for (const f of xray.findings) {
    const key = f.exposureKeys[0];
    if (f.id === "largest-company") {
      out.push({
        id: f.id,
        findingId: f.id,
        category: "concentration",
        severity: n(f, "pctOfPortfolio") >= 10 ? "high" : "medium",
        title: `${f.numbers.name} is your largest company exposure`,
        body: `Counting the shares inside your funds, ${f.numbers.name} reaches you through ${n(f, "paths")} routes.`,
        figure: `${pct(n(f, "pctOfPortfolio"))} of portfolio`,
        source: `SnapTrade holdings + ${snapshotSource}`,
        href: exposureHref(key),
        exposureKey: key,
      });
    } else if (f.id.startsWith("overlap-")) {
      out.push({
        id: f.id,
        findingId: f.id,
        category: "overlap",
        severity: "medium",
        title: `Hidden overlap in ${f.numbers.name}`,
        body: `${pct(n(f, "viaFundsSharePctOfThisExposure"))} of this exposure comes through funds, on top of shares you hold directly.`,
        figure: `${pct(n(f, "pctOfPortfolio"))} · ${n(f, "paths")} routes`,
        source: `SnapTrade holdings + ${snapshotSource}`,
        href: exposureHref(key),
        exposureKey: key,
      });
    } else if (f.id.startsWith("fund-overlap-")) {
      out.push({
        id: f.id,
        findingId: f.id,
        category: "overlap",
        severity: "high",
        title: `${f.numbers.fundA} and ${f.numbers.fundB} hold the same companies`,
        body: `They share ${n(f, "sharedTopHoldings")} of their top ${n(f, "snapshotSize")} holdings, so the second fund is largely the same exposure under a different ticker, not extra diversification.`,
        figure: `${pct(n(f, "combinedFundsPctOfPortfolio"))} of portfolio`,
        source: snapshotSource,
        href: "/exposure",
      });
    } else if (f.id === "largest-exposure") {
      out.push({
        id: f.id,
        findingId: f.id,
        category: "concentration",
        severity: n(f, "pctOfPortfolio") >= 10 ? "high" : "medium",
        title: `${f.numbers.name} is your largest single position`,
        body: `One holding makes up ${pct(n(f, "pctOfPortfolio"))} of everything you own.`,
        figure: `${pct(n(f, "pctOfPortfolio"))} of portfolio`,
        source: "SnapTrade holdings",
        href: exposureHref(key),
        exposureKey: key,
      });
    } else if (f.id === "top3-concentration") {
      out.push({
        id: f.id,
        findingId: f.id,
        category: "concentration",
        severity: n(f, "pctOfPortfolio") >= 40 ? "high" : "info",
        title: "Top-3 concentration",
        body: `${(f.numbers.names as string[]).join(", ")} together.`,
        figure: `${pct(n(f, "pctOfPortfolio"))} of portfolio`,
        source: `SnapTrade holdings + ${snapshotSource}`,
        href: "/exposure",
      });
    } else if (f.id === "cash-share") {
      out.push({
        id: f.id,
        findingId: f.id,
        category: "composition",
        severity: "info",
        title: "Cash share",
        body: "Cash and cash-equivalent funds across your accounts.",
        figure: `${pct(n(f, "pctOfPortfolio"))} of portfolio`,
        source: "SnapTrade balances",
        href: "/portfolio",
      });
    } else if (f.id === "unknown-remainder") {
      out.push({
        id: f.id,
        findingId: f.id,
        category: "data-quality",
        severity: "info",
        title: "Look-through covers each fund's top holdings only",
        body: "Fund holdings outside the snapshot aren't attributed to companies, so company figures are lower bounds.",
        figure: `${pct(n(f, "pctOfPortfolio"))} unattributed`,
        source: snapshotSource,
        href: "/exposure",
      });
    }
  }

  for (const fund of xray.fundsUsed) {
    const ageDays = Math.floor((today.getTime() - Date.parse(fund.asOf)) / 86_400_000);
    if (ageDays > STALE_DAYS) {
      out.push({
        id: `stale-${fund.symbol}`,
        category: "data-quality",
        severity: "medium",
        title: `${fund.symbol} holdings data is ${ageDays} days old`,
        body: `${fund.source} publishes ${fund.symbol}'s full holdings with a lag; weights may have shifted since ${fund.asOf}.`,
        figure: `as of ${fund.asOf}`,
        source: fund.source,
        href: "/exposure",
      });
    }
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
