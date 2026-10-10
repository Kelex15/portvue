"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search as SearchIcon, Sparkles } from "lucide-react";
import type { Finding } from "@/lib/xray";
import { CATEGORY_LABEL, type Insight, type InsightCategory } from "@/lib/insights";
import { Button } from "@/components/ui/button";
import { Panel, SourceNote } from "@/components/portvue/kit";
import { InsightIcon, InsightMeta } from "@/components/portvue/insight-card";
import { cn } from "@/lib/utils";

type Explanation = { paragraphs: { sentences: { text: string; findingIds: string[] }[] }[]; model: string };

const FILTERS: ("all" | InsightCategory)[] = ["all", "concentration", "overlap", "composition", "data-quality"];

const humanize = (k: string) =>
  k
    .replace(/Usd$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/Pct Of Portfolio/, "% of portfolio")
    .trim();

function formatValue(k: string, v: Finding["numbers"][string]) {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") {
    if (k.endsWith("Usd")) return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    if (/pct|Share|Weight/i.test(k)) return `${v.toFixed(1)}%`;
    return v.toLocaleString("en-US");
  }
  return v;
}

export function IntelligenceWorkspace({ insights, findings }: { insights: Insight[]; findings: Finding[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(insights[0]?.id);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return insights.filter(
      (i) => (filter === "all" || i.category === filter) && (!q || `${i.title} ${i.body}`.toLowerCase().includes(q)),
    );
  }, [insights, filter, query]);

  const selected = insights.find((i) => i.id === selectedId) ?? null;
  const finding = findings.find((f) => f.id === selected?.findingId);
  const insightNumber = (findingId: string) => insights.findIndex((i) => i.findingId === findingId) + 1;

  const cite = (findingId: string) => {
    const target = insights.find((i) => i.findingId === findingId);
    if (!target) return;
    setFilter("all");
    setQuery("");
    setSelectedId(target.id);
    requestAnimationFrame(() =>
      document.getElementById(`insight-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  return (
    <div className="space-y-6">
      <ExplainPanel insightNumber={insightNumber} onCite={cite} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel
          title="Findings"
          description={`${visible.length} of ${insights.length}, highest priority first`}
          action={
            <label className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search findings"
                aria-label="Search findings"
                className="h-8 w-40 rounded-lg border bg-background pr-2 pl-8 text-xs outline-none focus:border-primary/60"
              />
            </label>
          }
          bodyClassName="px-2 pb-2"
        >
          <div className="flex flex-wrap gap-1.5 px-3 pb-3">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium",
                  filter === f ? "border-primary/50 bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f === "all" ? "All" : CATEGORY_LABEL[f]}
              </button>
            ))}
          </div>
          {visible.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No findings match.</p>}
          <div className="divide-y divide-border">
            {visible.map((i) => (
              <button
                key={i.id}
                id={`insight-${i.id}`}
                type="button"
                onClick={() => setSelectedId(i.id)}
                className={cn(
                  "flex w-full scroll-mt-24 items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent/50",
                  i.id === selectedId && "bg-accent",
                )}
              >
                <InsightIcon insight={i} />
                <div className="min-w-0 flex-1 space-y-1">
                  <InsightMeta insight={i} />
                  <p className="text-sm leading-snug font-medium">
                    {i.findingId && <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">[{insightNumber(i.findingId)}]</span>}
                    {i.title}
                  </p>
                  <p className="text-[13px] text-muted-foreground">{i.body}</p>
                  {i.figure && <p className="pt-1 text-[13px] font-semibold tabular-nums sm:hidden">{i.figure}</p>}
                </div>
                {i.figure && (
                  <span className="hidden shrink-0 text-[13px] font-semibold whitespace-nowrap tabular-nums sm:block">{i.figure}</span>
                )}
              </button>
            ))}
          </div>
        </Panel>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <Panel title="Evidence" description={selected ? selected.title : "Select a finding"}>
            {selected && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <Tag>Computed from your data</Tag>
                  {selected.source.includes("snapshot") && <Tag tone="warning">Includes fund-snapshot estimate</Tag>}
                </div>
                {finding ? (
                  <dl className="divide-y divide-border rounded-xl border">
                    {Object.entries(finding.numbers).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 px-3 py-2 text-[13px]">
                        <dt className="text-muted-foreground">{humanize(k)}</dt>
                        <dd className="text-right font-medium tabular-nums">{formatValue(k, v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-[13px] text-muted-foreground">{selected.body}</p>
                )}
                <SourceNote>Source: {selected.source}</SourceNote>
                <Link href={selected.href} className="flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Open the exposure breakdown <ChevronRight className="size-3.5" />
                </Link>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "warning" | "ai" }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-medium",
        tone === "warning" ? "bg-warning/15 text-warning" : tone === "ai" ? "bg-info/15 text-info" : "bg-positive/15 text-positive",
      )}
    >
      {children}
    </span>
  );
}

function ExplainPanel({ insightNumber, onCite }: { insightNumber: (findingId: string) => number; onCite: (id: string) => void }) {
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
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-info" strokeWidth={1.75} />
          Plain-language summary
        </span>
      }
      description="A short summary of your findings, with each claim cited."
      action={
        <Button size="sm" onClick={explain} disabled={loading}>
          {loading ? "Explaining…" : data ? "Explain again" : "Explain my portfolio"}
        </Button>
      }
    >
      {!data && !error && !loading && (
        <p className="text-[13px] text-muted-foreground">Generate a short explanation of the findings below.</p>
      )}
      {loading && !data && <p className="text-[13px] text-muted-foreground">Reading your findings…</p>}
      {error && <p className="text-[13px] text-negative">{error}</p>}
      {data && (
        <div className="space-y-3">
          <Tag tone="ai">AI explanation</Tag>
          {data.paragraphs.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed">
              {p.sentences.map((s, j) => (
                <span key={j}>
                  {s.text}
                  {s.findingIds.length > 0 && (
                    <sup className="ml-0.5 rounded bg-primary/15 px-1 text-[0.7em] font-semibold text-primary">
                      [
                      {[...s.findingIds]
                        .sort((a, b) => insightNumber(a) - insightNumber(b))
                        .map((id, k) => (
                          <span key={id}>
                            {k > 0 && ", "}
                            <button
                              type="button"
                              onClick={() => onCite(id)}
                              title={`Show finding ${insightNumber(id)}`}
                              className="hover:underline"
                            >
                              {insightNumber(id) || "?"}
                            </button>
                          </span>
                        ))}
                      ]
                    </sup>
                  )}{" "}
                </span>
              ))}
            </p>
          ))}
          <SourceNote>
            AI-written from your computed findings. Not financial advice.
          </SourceNote>
        </div>
      )}
    </Panel>
  );
}
