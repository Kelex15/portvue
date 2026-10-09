"use client";

import { useState } from "react";
import type { Contribution, Exposure, XRay } from "@/lib/xray";
import { fmtPct, fmtUsd, fmtUsd0 } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MAX_ROWS = 15;
// Categorical slots in fixed order (validated: dataviz palette, light mode).
const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

const routeLabel = (c: Contribution) => (c.via === "direct" ? `Direct ${c.heldSymbol}` : `via ${c.via}`);

export function XRayPanel({ xray }: { xray: XRay }) {
  const [selected, setSelected] = useState<string | null>(
    (xray.findings.find((f) => f.id === "largest-company") ?? xray.findings[0])?.exposureKeys[0] ?? null,
  );
  const [highlighted, setHighlighted] = useState<string[]>([]);

  const routes = ["direct", ...xray.fundsUsed.map((f) => f.symbol)];
  const colorOf = (via: string) => SLOTS[routes.indexOf(via)] ?? SLOTS[SLOTS.length - 1];

  const rows = xray.exposures.slice(0, MAX_ROWS);
  const max = Math.max(...rows.map((e) => e.value), xray.unknownValue);
  const selectedExposure = xray.exposures.find((e) => e.key === selected) ?? null;

  const [highlightedFindings, setHighlightedFindings] = useState<string[]>([]);
  const findingNumber = (id: string) => xray.findings.findIndex((f) => f.id === id) + 1;

  const showEvidence = (keys: string[]) => {
    setHighlighted(keys);
    if (keys[0]) setSelected(keys[0]);
  };

  const cite = (ids: string[]) => {
    setHighlightedFindings(ids);
    showEvidence(xray.findings.filter((f) => ids.includes(f.id)).flatMap((f) => f.exposureKeys));
    document.getElementById(`finding-${ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>What you really own</CardTitle>
            <CardDescription>
              Exposure after looking through funds, as % of the {fmtUsd0(xray.totalValue)} portfolio. Click a bar to see
              where it comes from.
            </CardDescription>
            <Legend routes={routes} colorOf={colorOf} />
          </CardHeader>
          <CardContent className="space-y-1">
            {rows.map((e) => (
              <ExposureRow
                key={e.key}
                e={e}
                max={max}
                routes={routes}
                colorOf={colorOf}
                selected={e.key === selected}
                highlighted={highlighted.includes(e.key)}
                onClick={() => setSelected(e.key)}
              />
            ))}
            <div className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-3 px-2 py-1.5 text-sm text-muted-foreground">
              <span className="truncate">Rest of fund holdings</span>
              <div className="h-3">
                <div
                  className="h-full rounded-r bg-[repeating-linear-gradient(45deg,var(--muted-foreground)_0_1px,transparent_1px_5px)] opacity-60"
                  style={{ width: `${(xray.unknownValue / max) * 100}%` }}
                  title={`${fmtUsd(xray.unknownValue)} of fund value not covered by the top-holdings snapshot`}
                />
              </div>
              <span className="text-right tabular-nums">{fmtPct(xray.unknownValue / xray.totalValue)}</span>
            </div>
          </CardContent>
        </Card>

        <Evidence exposure={selectedExposure} colorOf={colorOf} totalValue={xray.totalValue} />
      </div>

      <ExplainCard findingNumber={findingNumber} onCite={cite} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Findings</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {xray.findings.map((f) => (
            <Card
              key={f.id}
              id={`finding-${f.id}`}
              size="sm"
              className={cn("scroll-mt-4", highlightedFindings.includes(f.id) && "ring-2 ring-primary")}
            >
              <CardHeader>
                <CardDescription className="font-mono text-xs">
                  [{findingNumber(f.id)}] {f.id}
                </CardDescription>
                <CardTitle>{f.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{f.summary}</p>
                {f.exposureKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => showEvidence(f.exposureKeys)}
                    className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Show evidence
                  </button>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Holdings and prices: SnapTrade. Fund look-through uses a <strong>sample snapshot</strong> of each fund&apos;s top
        holdings, not live data:{" "}
        {xray.fundsUsed.map((f, i) => (
          <span key={f.symbol}>
            {i > 0 && "; "}
            {f.symbol} as of {f.asOf}, source{" "}
            <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="underline">
              {f.source}
            </a>{" "}
            (top {fmtPct(f.coveredWeight)} of the fund)
          </span>
        ))}
        . Holdings outside each snapshot are shown as &quot;Rest of fund holdings&quot;, so company figures are lower
        bounds.
      </p>
    </div>
  );
}

type Explanation = { paragraphs: { sentences: { text: string; findingIds: string[] }[] }[]; model: string };

function ExplainCard({ findingNumber, onCite }: { findingNumber: (id: string) => number; onCite: (ids: string[]) => void }) {
  const [data, setData] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const explain = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/explain", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>In plain language</CardTitle>
          <CardDescription>
            Claude explains the findings above. It only sees the computed findings, and every sentence cites them.
          </CardDescription>
        </div>
        <Button onClick={explain} disabled={loading}>
          {loading ? "Explaining…" : data ? "Explain again" : "Explain my portfolio"}
        </Button>
      </CardHeader>
      {(data || error) && (
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {data?.paragraphs.map((p, i) => (
            <p key={i} className="leading-relaxed">
              {p.sentences.map((s, j) => (
                <span key={j}>
                  {s.text}
                  {s.findingIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onCite([id])}
                      title={id}
                      className="mx-0.5 rounded bg-primary/10 px-1 align-super text-[0.7em] font-medium text-primary hover:bg-primary/20"
                    >
                      {findingNumber(id)}
                    </button>
                  ))}{" "}
                </span>
              ))}
            </p>
          ))}
          {data && (
            <p className="text-xs text-muted-foreground">
              Educational, not financial advice. Written by {data.model} from the computed findings; numbers come from
              the app, not the model.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Legend({ routes, colorOf }: { routes: string[]; colorOf: (v: string) => string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
      {routes.map((r) => (
        <span key={r} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: colorOf(r) }} />
          {r === "direct" ? "Held directly" : `via ${r}`}
        </span>
      ))}
    </div>
  );
}

function ExposureRow(props: {
  e: Exposure;
  max: number;
  routes: string[];
  colorOf: (v: string) => string;
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  const { e, max, routes, colorOf, selected, highlighted, onClick } = props;
  const byRoute = routes
    .map((r) => ({ r, value: e.contributions.filter((c) => c.via === r).reduce((s, c) => s + c.value, 0) }))
    .filter((x) => x.value > 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid w-full grid-cols-[8rem_1fr_4.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
        selected && "bg-muted",
        highlighted && "ring-2 ring-primary",
      )}
    >
      <span className="truncate font-medium">{e.label}</span>
      <div className="flex h-3 gap-[2px]" style={{ width: `${(e.value / max) * 100}%` }}>
        {byRoute.map((x, i) => (
          <div
            key={x.r}
            className={cn("h-full min-w-[2px]", i === byRoute.length - 1 && "rounded-r")}
            style={{ flexGrow: x.value, background: colorOf(x.r) }}
            title={`${x.r === "direct" ? "Held directly" : `via ${x.r}`}: ${fmtUsd(x.value)}`}
          />
        ))}
      </div>
      <span className="text-right tabular-nums">{fmtPct(e.pct)}</span>
    </button>
  );
}

function Evidence({
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
      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
          <CardDescription>Select an exposure to see how it adds up.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardDescription>Evidence</CardDescription>
        <CardTitle className="text-xl">
          {exposure.label}: {fmtUsd(exposure.value)} ({fmtPct(exposure.pct)})
        </CardTitle>
        <CardDescription>
          {exposure.contributions.length} contribution{exposure.contributions.length === 1 ? "" : "s"} across{" "}
          {new Set(exposure.contributions.map((c) => c.accountName)).size} account(s), out of {fmtUsd0(totalValue)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>How</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exposure.contributions.map((c, i) => (
              <TableRow key={i}>
                <TableCell>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colorOf(c.via) }} />
                    {routeLabel(c)}
                  </span>
                </TableCell>
                <TableCell>{c.accountName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.via === "direct"
                    ? "shares held"
                    : `${fmtUsd0(c.fundValue!)} × ${fmtPct(c.fundWeight!, 2)} ${c.heldSymbol}`}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(c.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
