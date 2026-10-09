"use client";

import { useState } from "react";
import { fmtUsd, fmtUsd0 } from "@/lib/format";

const W = 640;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 64 };

export function ValueChart({ points }: { points: { date: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const yMin = lo - span * 0.1;
  const yMax = hi + span * 0.1;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const ticks = [0, 0.5, 1].map((t) => yMin + t * (yMax - yMin));
  const xLabels = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const h = hover !== null ? points[hover] : null;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Value from ${fmtUsd0(points[0].value)} on ${points[0].date} to ${fmtUsd0(points.at(-1)!.value)} on ${points.at(-1)!.date}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px]">
              {fmtUsd0(t)}
            </text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            className="fill-muted-foreground text-[11px]"
          >
            {points[i].date}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        {h && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-muted-foreground" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.value)} r={4} fill="var(--series-1)" className="stroke-card" strokeWidth={2} />
          </>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > points.length / 2 ? "-105%" : "5%"})` }}
        >
          <div className="text-muted-foreground">{h.date}</div>
          <div className="font-medium tabular-nums">{fmtUsd(h.value)}</div>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ closes }: { closes: { date: string; close: number }[] }) {
  if (closes.length < 2) return null;
  const w = 96;
  const h = 24;
  const vals = closes.map((c) => c.close);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`);
  const up = vals.at(-1)! >= vals[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`${closes[0].date} to ${closes.at(-1)!.date}: ${up ? "up" : "down"}`}>
      <title>{`${closes[0].date}: ${fmtUsd(vals[0])} → ${closes.at(-1)!.date}: ${fmtUsd(vals.at(-1)!)}`}</title>
      <polyline points={pts.join(" ")} fill="none" stroke="var(--series-1)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts.at(-1)!.split(",")[0]} cy={pts.at(-1)!.split(",")[1]} r={2} fill="var(--series-1)" />
    </svg>
  );
}
