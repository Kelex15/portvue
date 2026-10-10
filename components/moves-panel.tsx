"use client";

import { useEffect, useState } from "react";
import type { MovesReport, Period } from "@/lib/moves";
import type { DriverBlock } from "@/app/api/drivers/route";
import type { HistoryReport } from "@/lib/history";
import { Sparkline, ValueChart } from "@/components/history-charts";
import { fmtUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${fmtUsd(Math.abs(n))}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;

type Drivers = { blocks: DriverBlock[]; drivers: string[]; model?: string };

export function MovesPanel() {
  const [period, setPeriod] = useState<Period>("day");
  const [reports, setReports] = useState<Partial<Record<Period, MovesReport>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const report = reports[period];
  const [history, setHistory] = useState<HistoryReport | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setHistory(body);
      })
      .catch((e) => setHistoryError((e as Error).message));
  }, []);

  useEffect(() => {
    if (reports[period]) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/moves?period=${period}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setReports((r) => ({ ...r, [period]: body }));
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period, reports]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>{period === "day" ? "Today's moves" : "This week's moves"}</CardTitle>
          <CardDescription>Your units × the real price change.</CardDescription>
        </div>
        <div className="flex rounded-lg border p-0.5">
          {(["day", "week"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium",
                period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "day" ? "Today" : "This week"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && !report && (
          <p className="text-sm text-muted-foreground">
            Loading price moves…
          </p>
        )}
        {report && <MovesTable report={report} history={history} />}
        {report && report.topDrivers.length > 0 && <DriversSection key={period} report={report} />}
        {historyError && <p className="text-sm text-destructive">{historyError}</p>}
        {history && <HistorySection history={history} />}
      </CardContent>
    </Card>
  );
}

function HistorySection({ history }: { history: HistoryReport }) {
  const [open, setOpen] = useState(false);
  if (history.value.length < 2) return null;
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Show {history.value.length}-day history
      </Button>
    );
  }
  const first = history.value[0];
  return (
    <div className="space-y-2 rounded-xl border bg-background/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Your current holdings over the last {history.value.length} trading days</h3>
        {history.changeUsd !== null && (
          <span className={cn("text-sm font-medium tabular-nums", history.changeUsd >= 0 ? "text-positive" : "text-negative")}>
            {signedUsd(history.changeUsd)} ({signedPct(history.changePct ?? 0)}) since {first.date}
          </span>
        )}
      </div>
      <ValueChart points={history.value} />
      <p className="text-xs text-muted-foreground">
        Hypothetical: today&apos;s holdings at past closing prices, cash held constant.
      </p>
    </div>
  );
}

function MovesTable({ report, history }: { report: MovesReport; history: HistoryReport | null }) {
  const [showAll, setShowAll] = useState(false);
  // Priced holdings first (already sorted by impact), then any without data.
  const all = [...report.holdings.filter((h) => h.impactUsd !== null), ...report.holdings.filter((h) => h.impactUsd === null)];
  const rows = showAll ? all : all.slice(0, 5);
  return (
    <>
      <p className="text-sm">
        Net move{" "}
        <span className={cn("font-semibold tabular-nums", report.netImpactUsd >= 0 ? "text-positive" : "text-negative")}>
          {signedUsd(report.netImpactUsd)}
        </span>
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Holding</TableHead>
            <TableHead className="text-right">Move</TableHead>
            <TableHead className="text-right">Your impact</TableHead>
            <TableHead className="w-40">Share of movement</TableHead>
            <TableHead className="hidden sm:table-cell">{history ? `${history.days} days` : ""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => (
            <TableRow key={h.symbol} className={h.impactUsd === null ? "text-muted-foreground" : undefined}>
              <TableCell>
                <span className="font-medium">{h.symbol}</span>
                {report.topDrivers.includes(h.symbol) && (
                  <Badge variant="outline" className="ml-2">
                    top driver
                  </Badge>
                )}
                <MoveDate h={h} period={report.period} />
              </TableCell>
              {h.impactUsd === null ? (
                <TableCell colSpan={3} className="text-right text-xs">
                  No price data
                </TableCell>
              ) : (
                <>
                  <TableCell
                    className={cn("text-right font-medium tabular-nums", h.pctMove! >= 0 ? "text-positive" : "text-negative")}
                  >
                    {signedPct(h.pctMove!)}
                  </TableCell>
                  <TableCell
                    className={cn("text-right font-medium tabular-nums", h.impactUsd >= 0 ? "text-positive" : "text-negative")}
                  >
                    {signedUsd(h.impactUsd)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${h.shareOfMovement}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums">{h.shareOfMovement}%</span>
                    </div>
                  </TableCell>
                </>
              )}
              <TableCell className="hidden sm:table-cell">
                {history?.series[h.symbol] && <Sparkline closes={history.series[h.symbol]} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {all.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {showAll ? "Show top 5" : `Show all ${all.length}`}
        </button>
      )}
    </>
  );
}

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Only shown when a row's window differs from the obvious one (funds lag a day; weekly windows vary by asset).
function MoveDate({ h, period }: { h: MovesReport["holdings"][number]; period: Period }) {
  const closeDate = h.source?.match(/close (\d{4}-\d{2}-\d{2})/)?.[1];
  if (closeDate) return <div className="text-xs text-muted-foreground">{shortDate(closeDate)} close</div>;
  if (period === "week" && h.since) return <div className="text-xs text-muted-foreground">since {shortDate(h.since)}</div>;
  return null;
}

function DriversSection({ report }: { report: MovesReport }) {
  const [data, setData] = useState<Drivers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const drivers = report.holdings.filter((h) => report.topDrivers.includes(h.symbol));

  const find = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/drivers", { method: "POST", body: JSON.stringify({ period: report.period }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Number sources in order of first appearance so the same URL keeps one number.
  const sources: { url: string; title: string | null }[] = [];
  const sourceNumber = (url: string) => {
    let i = sources.findIndex((s) => s.url === url);
    if (i === -1) i = sources.push({ url, title: null }) - 1;
    return i + 1;
  };
  data?.blocks.forEach((b) => b.citations.forEach((c) => (sources[sourceNumber(c.url) - 1].title ??= c.title)));

  return (
    <div className="space-y-3 rounded-xl border bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Top drivers</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {drivers.map((h) => (
              <li key={h.symbol}>
                <span className="font-medium">{h.symbol}</span> {signedUsd(h.impactUsd!)}
                {h.alsoVia.length > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · also held via {h.alsoVia.map((v) => `${v.fund} in ${v.accountName} (${fmtUsd(v.valueUsd)})`).join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="outline" onClick={find} disabled={loading}>
          {loading ? "Searching the news…" : data ? "Search again" : "Find possible drivers"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {data && (
        <div className="space-y-2">
          <p className="leading-relaxed whitespace-pre-line">
            {data.blocks.map((b, i) => (
              <span key={i}>
                {b.text.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                  part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part,
                )}
                {[...new Set(b.citations.map((c) => c.url))].map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="mx-0.5 rounded bg-primary/10 px-1 align-super text-[0.7em] font-medium text-primary hover:bg-primary/20"
                  >
                    {sourceNumber(url)}
                  </a>
                ))}
              </span>
            ))}
          </p>
          {sources.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
              {sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                    {s.title ?? s.url}
                  </a>
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-muted-foreground">
            Possible drivers from news, not confirmed causes.
          </p>
        </div>
      )}
    </div>
  );
}
