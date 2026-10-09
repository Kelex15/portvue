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
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>What moved your portfolio</CardTitle>
          <CardDescription>
            Price moves from {period === "day" ? "Finnhub" : "Alpha Vantage"} (market data); holdings from SnapTrade.
            Impact = your units × the real price change.
          </CardDescription>
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
            Loading price moves{period === "week" ? " (first load of the day can take a minute)" : ""}…
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
  if (history.value.length < 2) return null;
  const first = history.value[0];
  const last = history.value.at(-1)!;
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Your current holdings over the last {history.value.length} trading days</h3>
        {history.changeUsd !== null && (
          <span className={cn("text-sm font-medium tabular-nums", history.changeUsd >= 0 ? "text-emerald-700" : "text-red-700")}>
            {signedUsd(history.changeUsd)} ({signedPct(history.changePct ?? 0)}) since {first.date}
          </span>
        )}
      </div>
      <ValueChart points={history.value} />
      <p className="text-xs text-muted-foreground">
        Hypothetical: today&apos;s units of {history.symbols.join(", ")} valued at each day&apos;s market close from{" "}
        {history.source}, not your actual account history (units may have changed). Crypto and cash aren&apos;t included,
        and fund prices are carried forward on days without a published price, so the {last.date} value differs from
        SnapTrade&apos;s total.
        {history.missingSymbols.length > 0 && ` No price history for ${history.missingSymbols.join(", ")}.`}
      </p>
    </div>
  );
}

function MovesTable({ report, history }: { report: MovesReport; history: HistoryReport | null }) {
  const priced = report.holdings.filter((h) => h.impactUsd !== null);
  return (
    <>
      <p className="text-sm">
        Net move on priced holdings:{" "}
        <span className={cn("font-semibold tabular-nums", report.netImpactUsd >= 0 ? "text-emerald-700" : "text-red-700")}>
          {signedUsd(report.netImpactUsd)}
        </span>{" "}
        <span className="text-muted-foreground">on {fmtUsd(report.pricedValueUsd)} of holdings</span>
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
          {priced.map((h) => (
            <TableRow key={h.symbol}>
              <TableCell>
                <span className="font-medium">{h.symbol}</span>
                {report.topDrivers.includes(h.symbol) && (
                  <Badge variant="outline" className="ml-2">
                    top driver
                  </Badge>
                )}
                {h.since && <div className="text-xs text-muted-foreground">since {h.since}</div>}
              </TableCell>
              <TableCell
                className={cn("text-right font-medium tabular-nums", h.pctMove! >= 0 ? "text-emerald-700" : "text-red-700")}
              >
                {signedPct(h.pctMove!)}
              </TableCell>
              <TableCell
                className={cn("text-right font-medium tabular-nums", h.impactUsd! >= 0 ? "text-emerald-700" : "text-red-700")}
              >
                {signedUsd(h.impactUsd!)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${h.shareOfMovement}%` }} />
                  </div>
                  <span className="w-12 text-right text-xs tabular-nums">{h.shareOfMovement}%</span>
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {history?.series[h.symbol] && <Sparkline closes={history.series[h.symbol]} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {report.unpricedSymbols.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No recent price data for {report.unpricedSymbols.join(", ")} (not covered by the market-data source), so they
          are left out of the totals.
        </p>
      )}
    </>
  );
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
    <div className="space-y-3 rounded-lg border p-4">
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
            Possible drivers found by {data.model ?? "Claude"} with web search; news coincides with moves but isn&apos;t
            proof of cause. Educational, not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
