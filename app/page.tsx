import { Suspense } from "react";
import { Lightbulb } from "lucide-react";
import type { Portfolio } from "@/lib/portfolio";
import { lookThrough, type FundData, type XRay } from "@/lib/xray";
import { computeMoves } from "@/lib/moves";
import { allocation } from "@/lib/allocation";
import { toInsights } from "@/lib/insights";
import etfHoldings from "@/data/etf-holdings.json";
import { fmtPct, fmtUsd0 } from "@/lib/format";
import { PortfolioGate } from "@/components/portfolio-gate";
import { Kpi, PageHeader, Panel, PanelLink, Skeleton, SourceNote, signedPct, signedUsd, toneOf } from "@/components/portvue/kit";
import { Donut } from "@/components/portvue/donut";
import { InsightRow } from "@/components/portvue/insight-card";
import { HistoryPanel } from "@/components/portvue/history-panel";

export const dynamic = "force-dynamic";

const SLICE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  return <PortfolioGate>{(p) => <Home p={p} />}</PortfolioGate>;
}

function Home({ p }: { p: Portfolio }) {
  const xray = lookThrough(p, etfHoldings as FundData);
  const insights = toInsights(xray);
  const alloc = allocation(p);
  const investable = p.holdings.filter((h) => !h.cashEquivalent);

  return (
    <>
      <PageHeader
        title={greeting()}
        subtitle={`Here's what you really own across ${p.accounts.length} connected accounts.`}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Total value" value={fmtUsd0(p.totalValue)} sub="Across all accounts" />
        <Suspense fallback={<KpiSkeleton label="Day change" />}>
          <DayChangeKpi p={p} xray={xray} />
        </Suspense>
        <Kpi label="Accounts" value={p.accounts.length} sub={p.accounts.map((a) => a.name).join(" · ")} />
        <Kpi label="Holdings" value={investable.length} sub="Unique symbols across accounts" />
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" strokeWidth={1.75} />
            Portfolio intelligence
          </span>
        }
        description="What stands out in your portfolio, highest priority first."
        action={<PanelLink href="/intelligence">View all {insights.length}</PanelLink>}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {insights.slice(0, 4).map((i) => (
            <InsightRow key={i.id} insight={i} />
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <Panel title="Allocation" description="By asset class">
            <Donut
              centerLabel="Total value"
              slices={alloc.map((a, i) => ({
                label: a.assetClass,
                value: a.value,
                color: SLICE_COLORS[i],
                detail: a.assetClass === "Cash" ? "Includes money-market funds" : a.symbols.join(", "),
              }))}
            />
          </Panel>
          <HistoryPanel />
        </div>

        <div className="space-y-6">
          <TopExposures xray={xray} />
          <Concentration xray={xray} />
        </div>
      </div>

    </>
  );
}

async function DayChangeKpi({ p, xray }: { p: Portfolio; xray: XRay }) {
  const moves = await computeMoves(p, xray, "day").catch(() => null);
  if (!moves || moves.pricedValueUsd === 0) return <Kpi label="Day change" value="—" sub="No recent price data" />;
  return (
    <Kpi
      label="Day change"
      value={signedUsd(moves.netImpactUsd)}
      tone={toneOf(moves.netImpactUsd)}
      sub={`${signedPct((moves.netImpactUsd / (moves.pricedValueUsd - moves.netImpactUsd)) * 100)} today`}
    />
  );
}

function KpiSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Skeleton className="mt-2 h-7 w-28" />
      <Skeleton className="mt-2.5 h-3 w-36" />
    </div>
  );
}

function TopExposures({ xray }: { xray: XRay }) {
  const rows = xray.exposures.slice(0, 5);
  return (
    <Panel
      title="Top exposures"
      description="After looking through funds"
      action={<PanelLink href="/exposure">All {xray.exposures.length}</PanelLink>}
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground">
            <th className="pb-2 font-medium">Company / holding</th>
            <th className="pb-2 text-right font-medium">Direct / via funds</th>
            <th className="pb-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const direct = e.contributions.filter((c) => c.via === "direct").reduce((s, c) => s + c.value, 0);
            return (
              <tr key={e.key} className="border-t">
                <td className="py-2.5">
                  <a href={`/exposure?company=${encodeURIComponent(e.key)}`} className="font-medium hover:text-primary">
                    {e.label}
                  </a>
                </td>
                <td className="py-2.5 text-right text-muted-foreground tabular-nums">
                  {fmtPct(direct / xray.totalValue)} / {fmtPct((e.value - direct) / xray.totalValue)}
                </td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{fmtPct(e.pct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <SourceNote className="mt-3">Fund contents from sample snapshots.</SourceNote>
    </Panel>
  );
}

function Concentration({ xray }: { xray: XRay }) {
  const share = (n: number) => xray.exposures.slice(0, n).reduce((s, e) => s + e.value, 0) / xray.totalValue;
  const companies = xray.exposures.filter((e) => e.contributions.some((c) => c.via !== "direct"));
  const multiRoute = companies.filter((e) => new Set(e.contributions.map((c) => `${c.via}|${c.accountName}`)).size >= 2);
  const rows = [
    { label: "Top 3 exposures", value: fmtPct(share(3)), bar: share(3) },
    { label: "Top 5 exposures", value: fmtPct(share(5)), bar: share(5) },
    { label: "Cash", value: fmtPct(xray.cash / xray.totalValue), bar: xray.cash / xray.totalValue },
    { label: "Companies reached 2+ ways", value: `${multiRoute.length} of ${companies.length}`, bar: multiRoute.length / Math.max(companies.length, 1) },
  ];
  return (
    <Panel title="Concentration" description="How much rides on a few positions">
      <ul className="space-y-3.5">
        {rows.map((r) => (
          <li key={r.label} className="space-y-1.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-medium tabular-nums">{r.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(r.bar, 1) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
