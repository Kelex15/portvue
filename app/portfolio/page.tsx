import { fmtPct, fmtUnits, fmtUsd, fmtUsd0 } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PortfolioGate } from "@/components/portfolio-gate";
import { PageHeader, Panel, SourceNote } from "@/components/portvue/kit";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return (
    <>
      <PageHeader title="Portfolio" subtitle="Every holding across your connected accounts, combined by symbol." />
      <PortfolioGate>
        {(p) => (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {p.accounts.map((a) => {
                const positions = p.positions.filter((x) => x.accountId === a.id && !x.cashEquivalent);
                return (
                  <div key={a.id} className="rounded-2xl border bg-card px-5 py-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {a.institution} •••• {a.number.replace(/\D/g, "").slice(-4)}
                      </p>
                    </div>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{fmtUsd0(a.reportedTotal ?? 0)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {positions.length} positions · {fmtUsd0(a.cash)} cash
                    </p>
                  </div>
                );
              })}
            </div>

            <Panel title="Holdings" description={`${p.holdings.length} symbols · market value = units × price`} bodyClassName="px-2 pb-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground">
                      <th className="px-3 pb-2 font-medium">Symbol</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Accounts</th>
                      <th className="pb-2 text-right font-medium">Units</th>
                      <th className="pb-2 text-right font-medium">Price</th>
                      <th className="pb-2 text-right font-medium">Value</th>
                      <th className="px-3 pb-2 text-right font-medium">% of portfolio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.holdings.map((h) => (
                      <tr key={h.symbol} className={h.cashEquivalent ? "border-t text-muted-foreground" : "border-t"}>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{h.symbol}</div>
                          <div className="max-w-56 truncate text-[11px] text-muted-foreground">{h.name}</div>
                        </td>
                        <td className="py-2.5">
                          <Badge variant="secondary">{h.kind}</Badge>
                          {h.cashEquivalent && (
                            <Badge variant="outline" className="ml-1">
                              counted in cash
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-muted-foreground">{h.accounts.map((a) => a.accountName).join(", ")}</td>
                        <td className="py-2.5 text-right tabular-nums">{fmtUnits(h.units)}</td>
                        <td className="py-2.5 text-right tabular-nums">{fmtUsd(h.price)}</td>
                        <td className="py-2.5 text-right font-medium tabular-nums">{fmtUsd(h.value)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {h.cashEquivalent ? "—" : fmtPct(h.value / p.totalValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <SourceNote className="mt-3 px-3">
                Updated {new Date(p.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </SourceNote>
            </Panel>
          </>
        )}
      </PortfolioGate>
    </>
  );
}
