"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Search as SearchIcon } from "lucide-react";
import type { Exposure, XRay } from "@/lib/xray";
import type { Allocation } from "@/lib/allocation";
import { fmtPct, fmtUsd, fmtUsd0 } from "@/lib/format";
import { Panel, SourceNote } from "@/components/portvue/kit";
import { Donut } from "@/components/portvue/donut";
import { cn } from "@/lib/utils";

const SLOTS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
];
type SortKey = "total" | "direct" | "funds" | "name";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "total", label: "Total exposure" },
  { key: "direct", label: "Direct" },
  { key: "funds", label: "Via funds" },
  { key: "name", label: "Name" },
];

const directOf = (e: Exposure) =>
  e.contributions
    .filter((c) => c.via === "direct")
    .reduce((s, c) => s + c.value, 0);
const routesOf = (e: Exposure) =>
  new Set(e.contributions.map((c) => `${c.via}|${c.accountName}`)).size;

export function ExposureWorkspace({
  xray,
  allocation,
  initialCompany,
}: {
  xray: XRay;
  allocation: Allocation[];
  initialCompany?: string;
}) {
  const [tab, setTab] = useState<"companies" | "assets">("companies");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("total");
  const [selected, setSelected] = useState<string>(
    xray.exposures.find((e) => e.key === initialCompany)?.key ??
      xray.findings.find((f) => f.id === "largest-company")?.exposureKeys[0] ??
      xray.exposures[0]?.key,
  );

  const routes = ["direct", ...xray.fundsUsed.map((f) => f.symbol)];
  const colorOf = (via: string) => SLOTS[routes.indexOf(via)] ?? SLOTS[3];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = xray.exposures.filter(
      (e) =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.contributions.some((c) => c.heldSymbol.toLowerCase().includes(q)),
    );
    const by: Record<SortKey, (a: Exposure, b: Exposure) => number> = {
      total: (a, b) => b.value - a.value,
      direct: (a, b) => directOf(b) - directOf(a),
      funds: (a, b) => b.value - directOf(b) - (a.value - directOf(a)),
      name: (a, b) => a.label.localeCompare(b.label),
    };
    return [...list].sort(by[sort]);
  }, [xray.exposures, query, sort]);

  const viaFundsCompanies = xray.exposures.filter((e) =>
    e.contributions.some((c) => c.via !== "direct"),
  ).length;
  const coveredFundValue = xray.remainders.reduce(
    (s, r) => s + r.fundValue - r.value,
    0,
  );
  const totalFundValue = xray.remainders.reduce((s, r) => s + r.fundValue, 0);
  const current = xray.exposures.find((e) => e.key === selected) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Portfolio value"
          value={fmtUsd0(xray.totalValue)}
          sub="All accounts"
        />
        <Stat
          label="Companies via funds"
          value={String(viaFundsCompanies)}
          sub={`Inside ${xray.fundsUsed.map((f) => f.symbol).join(" and ")}`}
        />
        <Stat
          label="Look-through coverage"
          value={fmtPct(coveredFundValue / totalFundValue)}
          sub="Of fund value mapped to companies"
        />
        <Stat
          label="Fund snapshots"
          value={xray.fundsUsed.map((f) => shortDate(f.asOf)).join(" · ")}
          sub={`As of, for ${xray.fundsUsed.map((f) => f.symbol).join(" · ")}`}
        />
      </div>

      <div className="flex gap-1 border-b">
        {(
          [
            ["companies", "Companies"],
            ["assets", "Asset classes"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium",
              tab === k
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "companies" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Panel
            title="Ranked exposure"
            description={`${rows.length} of ${xray.exposures.length} · % of portfolio`}
            action={
              <div className="flex items-center gap-2">
                <label className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter"
                    aria-label="Filter companies"
                    className="h-8 w-32 rounded-lg border bg-background pr-2 pl-8 text-xs outline-none focus:border-primary/60"
                  />
                </label>
                <label className="relative">
                  <ArrowDownUp className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    aria-label="Sort by"
                    className="h-8 appearance-none rounded-lg border bg-background pr-3 pl-8 text-xs outline-none focus:border-primary/60"
                  >
                    {SORTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            }
            bodyClassName="px-2 pb-3"
          >
            <Legend routes={routes} colorOf={colorOf} />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] sm:min-w-[520px]">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground">
                    <th className="px-3 pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Company / holding</th>
                    <th className="hidden pb-2 text-right font-medium sm:table-cell">Direct</th>
                    <th className="pb-2 text-right font-medium">Via funds</th>
                    <th className="hidden w-28 pb-2 pl-4 font-medium sm:table-cell">Split</th>
                    <th className="px-3 pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const direct = directOf(e);
                    const active = e.key === selected;
                    return (
                      <tr
                        key={e.key}
                        onClick={() => setSelected(e.key)}
                        className={cn(
                          "cursor-pointer border-t transition-colors hover:bg-accent/50",
                          active && "bg-accent",
                        )}
                      >
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                          {xray.exposures.indexOf(e) + 1}
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            className="text-left font-medium"
                            onClick={() => setSelected(e.key)}
                          >
                            {e.label}
                          </button>
                          <span className="ml-2 text-[11px] text-muted-foreground">
                            {routesOf(e)} route{routesOf(e) === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td className="hidden py-2.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                          {fmtPct(direct / xray.totalValue)}
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground tabular-nums">
                          {fmtPct((e.value - direct) / xray.totalValue)}
                        </td>
                        <td className="hidden py-2.5 pl-4 sm:table-cell">
                          <SplitBar e={e} routes={routes} colorOf={colorOf} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {fmtPct(e.pct)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t text-muted-foreground">
                    <td className="px-3 py-2.5" />
                    <td className="py-2.5" colSpan={4}>
                      Fund holdings outside the snapshot{" "}
                      <span className="text-[11px]">(not attributed)</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fmtPct(xray.unknownValue / xray.totalValue)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="xl:sticky xl:top-24 xl:self-start">
            <CompanyDetail
              exposure={current}
              colorOf={colorOf}
              totalValue={xray.totalValue}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel
            title="Asset classes"
            description="As SnapTrade classifies each holding"
          >
            <Donut
              centerLabel="Total value"
              slices={allocation.map((a, i) => ({
                label: a.assetClass,
                value: a.value,
                color: SLOTS[i],
              }))}
            />
          </Panel>
          <Panel title="What's in each class">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="pb-2 font-medium">Class</th>
                  <th className="pb-2 font-medium">Holdings</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                  <th className="pb-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {allocation.map((a) => (
                  <tr key={a.assetClass} className="border-t">
                    <td className="py-2.5 font-medium">{a.assetClass}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {a.assetClass === "Cash"
                        ? "Cash balances + money-market funds"
                        : a.symbols.join(", ")}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {fmtUsd0(a.value)}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">
                      {fmtPct(a.pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SourceNote className="mt-3">
              Funds count as one class here; the Companies tab looks inside them.
            </SourceNote>
          </Panel>
        </div>
      )}

      <SourceNote>
        Fund contents from sample snapshots:{" "}
        {xray.fundsUsed.map((f, i) => (
          <span key={f.symbol}>
            {i > 0 && "; "}
            {f.symbol} {shortDate(f.asOf)} (
            <a
              href={f.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {f.source.split(",")[0]}
            </a>
            )
          </span>
        ))}
        . Figures are lower bounds.
      </SourceNote>
    </div>
  );
}

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Legend({
  routes,
  colorOf,
}: {
  routes: string[];
  colorOf: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-3 text-[11px] text-muted-foreground">
      {routes.map((r) => (
        <span key={r} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: colorOf(r) }}
          />
          {r === "direct" ? "Held directly" : `via ${r}`}
        </span>
      ))}
    </div>
  );
}

function SplitBar({
  e,
  routes,
  colorOf,
}: {
  e: Exposure;
  routes: string[];
  colorOf: (v: string) => string;
}) {
  const parts = routes
    .map((r) => ({
      r,
      v: e.contributions
        .filter((c) => c.via === r)
        .reduce((s, c) => s + c.value, 0),
    }))
    .filter((x) => x.v > 0);
  return (
    <div className="flex h-2 w-24 gap-[2px] overflow-hidden rounded-full">
      {parts.map((x) => (
        <div
          key={x.r}
          style={{ flexGrow: x.v, background: colorOf(x.r) }}
          title={`${x.r === "direct" ? "Held directly" : `via ${x.r}`}: ${fmtUsd(x.v)}`}
        />
      ))}
    </div>
  );
}

function CompanyDetail({
  exposure,
  colorOf,
  totalValue,
}: {
  exposure: Exposure | null;
  colorOf: (v: string) => string;
  totalValue: number;
}) {
  if (!exposure) {
    return (
      <Panel title="Exposure breakdown">
        <p className="text-[13px] text-muted-foreground">
          Select a company to see where its exposure comes from.
        </p>
      </Panel>
    );
  }
  const direct = directOf(exposure);
  const viaFunds = exposure.value - direct;

  return (
    <Panel
      title={`Exposure breakdown: ${exposure.label}`}
      description={`${exposure.contributions.length} contributing position(s)`}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Total exposure</p>
          <p className="text-[28px] leading-none font-semibold tabular-nums">
            {fmtPct(exposure.pct)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {fmtUsd(exposure.value)} of {fmtUsd0(totalValue)}
          </p>
        </div>
        <dl className="space-y-1 text-[13px]">
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ background: colorOf("direct") }}
            />
            <dt className="w-24 text-muted-foreground">Direct</dt>
            <dd className="w-14 text-right tabular-nums">
              {fmtPct(direct / totalValue)}
            </dd>
            <dd className="w-20 text-right text-muted-foreground tabular-nums">
              {fmtUsd0(direct)}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-muted-foreground" />
            <dt className="w-24 text-muted-foreground">Via funds</dt>
            <dd className="w-14 text-right tabular-nums">
              {fmtPct(viaFunds / totalValue)}
            </dd>
            <dd className="w-20 text-right text-muted-foreground tabular-nums">
              {fmtUsd0(viaFunds)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="pb-2 font-medium">Route</th>
              <th className="pb-2 font-medium">Account</th>
              <th className="hidden pb-2 font-medium sm:table-cell">Calculation</th>
              <th className="pb-2 text-right font-medium">Exposure</th>
            </tr>
          </thead>
          <tbody>
            {exposure.contributions.map((c, i) => (
              <tr key={i} className="border-t">
                <td className="py-2.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: colorOf(c.via) }}
                    />
                    {c.via === "direct"
                      ? `${c.heldSymbol} shares`
                      : `${c.via} (holds ${c.heldSymbol})`}
                  </span>
                </td>
                <td className="py-2.5 text-muted-foreground">
                  {c.accountName}
                </td>
                <td className="hidden py-2.5 text-xs text-muted-foreground tabular-nums sm:table-cell">
                  {c.via === "direct"
                    ? "units × price"
                    : `${fmtUsd0(c.fundValue!)} × ${fmtPct(c.fundWeight!, 2)}`}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  <span className="font-medium">
                    {fmtPct(c.value / totalValue, 2)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {fmtUsd(c.value)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
