"use client";

import { useState } from "react";
import { fmtPct, fmtUsd0 } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DonutSlice = { label: string; value: number; color: string; detail?: string };

const R = 42;
const STROKE = 14;
const C = 2 * Math.PI * R;
const GAP = 1.2; // surface gap between segments, in circumference units

export function Donut({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  const focus = hover !== null ? slices[hover] : null;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`${centerLabel} ${fmtUsd0(total)}`}>
          {slices.map((s, i) => {
            const len = (s.value / total) * C;
            const dash = `${Math.max(len - GAP, 0.5)} ${C}`;
            const el = (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? STROKE + 2 : STROKE}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                className="cursor-pointer transition-[stroke-width]"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-lg font-semibold tabular-nums">{fmtUsd0(focus ? focus.value : total)}</p>
            <p className="text-[11px] text-muted-foreground">{focus ? focus.label : centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {slices.map((s, i) => (
          <li
            key={s.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            className={cn("flex min-w-0 items-center gap-2.5 text-[13px]", hover !== null && hover !== i && "opacity-60")}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">
              {s.label}
              {s.detail && <span className="block text-[11px] text-muted-foreground">{s.detail}</span>}
            </span>
            <span className="text-muted-foreground tabular-nums">{fmtUsd0(s.value)}</span>
            <span className="w-14 text-right font-medium tabular-nums">{fmtPct(s.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
