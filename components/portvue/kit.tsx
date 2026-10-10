import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border bg-card", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="space-y-0.5">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn("p-5", title && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "positive" | "negative" }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-2 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export const toneOf = (n: number): "positive" | "negative" => (n >= 0 ? "positive" : "negative");
export const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${fmtUsd(Math.abs(n))}`;
export const signedPct = (n: number, digits = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;

export function Signed({ value, format = "usd", className }: { value: number; format?: "usd" | "pct"; className?: string }) {
  return (
    <span className={cn("tabular-nums", value >= 0 ? "text-positive" : "text-negative", className)}>
      {format === "usd" ? signedUsd(value) : signedPct(value)}
    </span>
  );
}

export function SourceNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[11px] leading-relaxed text-subtle", className)}>
      <Info className="mt-px size-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-negative/40 bg-negative/5 p-5">
      <p className="font-medium text-negative">{title}</p>
      {detail && <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
