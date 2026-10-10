import Link from "next/link";
import { ChevronRight, Database, Layers, PieChart, Target } from "lucide-react";
import { CATEGORY_LABEL, type Insight, type InsightCategory, type Severity } from "@/lib/insights";
import { cn } from "@/lib/utils";

const ICON: Record<InsightCategory, typeof Target> = {
  concentration: Target,
  overlap: Layers,
  composition: PieChart,
  "data-quality": Database,
};

const TONE: Record<Severity, string> = {
  high: "bg-warning/15 text-warning",
  medium: "bg-info/15 text-info",
  info: "bg-muted text-muted-foreground",
};

const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", info: "Info" };

export function InsightIcon({ insight }: { insight: Insight }) {
  const Icon = ICON[insight.category];
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONE[insight.severity])}>
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}

export function InsightMeta({ insight }: { insight: Insight }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="font-medium">{CATEGORY_LABEL[insight.category]}</span>
      <span aria-hidden>·</span>
      <span className={cn(insight.severity === "high" && "text-warning", insight.severity === "medium" && "text-info")}>
        {SEVERITY_LABEL[insight.severity]}
      </span>
    </span>
  );
}

const ACCENT: Record<Severity, string> = {
  high: "before:bg-warning",
  medium: "before:bg-info",
  info: "before:bg-subtle",
};

export function shortSource(source: string) {
  const snapshot = source.includes("snapshot");
  if (snapshot && source.includes("SnapTrade")) return "SnapTrade + fund snapshots";
  if (snapshot) return "Fund snapshots";
  return source;
}

// Feed card: the whole card links to the evidence.
export function InsightRow({ insight }: { insight: Insight }) {
  return (
    <Link
      href={insight.href}
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-background/40 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40",
        "before:absolute before:inset-y-4 before:left-0 before:w-0.5 before:rounded-full",
        ACCENT[insight.severity],
      )}
    >
      <div className="flex items-start gap-3">
        <InsightIcon insight={insight} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <InsightMeta insight={insight} />
            <span className="truncate text-[11px] text-subtle" title={insight.source}>
              {shortSource(insight.source)}
            </span>
          </div>
          <p className="text-sm leading-snug font-medium">{insight.title}</p>
          <p className="line-clamp-2 text-[13px] text-muted-foreground">{insight.body}</p>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3">
        <span className="text-base font-semibold tabular-nums">{insight.figure}</span>
        <span className="flex items-center gap-0.5 text-xs font-medium text-primary">
          View evidence
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
