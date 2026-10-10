"use client";

import { useEffect, useState } from "react";
import type { HistoryReport } from "@/lib/history";
import { ValueChart } from "@/components/history-charts";
import { Panel, Signed, Skeleton, SourceNote } from "@/components/portvue/kit";

export function HistoryPanel() {
  const [data, setData] = useState<HistoryReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <Panel
      title="Portfolio value history"
      description={data ? `Last ${data.value.length} trading days` : "Last 90 trading days"}
      action={
        data?.changeUsd != null ? (
          <span className="text-right text-[13px] font-medium">
            <Signed value={data.changeUsd} /> <Signed value={data.changePct ?? 0} format="pct" className="text-xs" />
          </span>
        ) : null
      }
    >
      {error && <p className="text-[13px] text-negative">{error}</p>}
      {!data && !error && <Skeleton className="h-48 w-full" />}
      {data && data.value.length >= 2 && (
        <div className="space-y-3">
          <ValueChart points={data.value} />
          <SourceNote>
            Hypothetical: today&apos;s holdings at past closing prices, cash held constant.
          </SourceNote>
        </div>
      )}
      {data && data.value.length < 2 && <p className="text-[13px] text-muted-foreground">No price history yet.</p>}
    </Panel>
  );
}
