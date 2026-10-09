import { getPortfolio, type Portfolio } from "@/lib/portfolio";
import { lookThrough, type FundData } from "@/lib/xray";
import etfHoldings from "@/data/etf-holdings.json";
import { XRayPanel } from "@/components/xray-panel";
import { MovesPanel } from "@/components/moves-panel";
import { fmtPct, fmtUnits, fmtUsd, fmtUsd0 } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function Home() {
  let portfolio: Portfolio | null = null;
  let loadError: string | null = null;
  try {
    portfolio = await getPortfolio();
  } catch (e) {
    const err = e as { message?: string; responseBody?: unknown };
    loadError = `${err.message ?? String(e)}${err.responseBody ? ` ${JSON.stringify(err.responseBody)}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Portvue</h1>
          <p className="text-muted-foreground">Portfolio X-Ray: what you really own, across every account.</p>
        </div>
        <Button render={<a href="/api/connect" />} variant="outline">
          Connect a brokerage
        </Button>
      </header>

      {loadError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Couldn&apos;t load accounts from SnapTrade</CardTitle>
            <CardDescription className="font-mono text-xs break-all">{loadError}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {portfolio && portfolio.accounts.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No accounts connected yet</CardTitle>
            <CardDescription>Connect the SnapTrade Sandbox to see your holdings.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {portfolio && portfolio.accounts.length > 0 && <PortfolioView p={portfolio} />}
    </main>
  );
}

function PortfolioView({ p }: { p: Portfolio }) {
  const investable = p.holdings.filter((h) => !h.cashEquivalent);
  const totalsDiffer = Math.abs(p.totalValue - p.reportedTotal) > 0.01;

  return (
    <>
      {p.warnings.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Some positions were left out</CardTitle>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {p.warnings.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </CardHeader>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Total value" value={fmtUsd0(p.totalValue)} hint={totalsDiffer ? `SnapTrade reports ${fmtUsd0(p.reportedTotal)}` : undefined} />
        <Tile label="Cash" value={fmtUsd0(p.cash)} hint={`${fmtPct(p.cash / p.totalValue)} of portfolio`} />
        <Tile label="Holdings" value={String(investable.length)} hint="unique symbols" />
        <Tile label="Accounts" value={String(p.accounts.length)} hint={p.accounts.map((a) => a.name).join(" · ")} />
      </section>

      <XRayPanel xray={lookThrough(p, etfHoldings as FundData)} />

      <MovesPanel />

      <Card>
        <CardHeader>
          <CardTitle>Holdings across accounts</CardTitle>
          <CardDescription>
            Combined by symbol. Market value = units × price. Source: SnapTrade
            {p.asOf ? `, as of ${new Date(p.asOf).toLocaleString("en-US")}` : ""} (fetched{" "}
            {new Date(p.fetchedAt).toLocaleTimeString("en-US")}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">% of portfolio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.holdings.map((h) => (
                <TableRow key={h.symbol} className={h.cashEquivalent ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    <div className="font-medium">{h.symbol}</div>
                    <div className="max-w-56 truncate text-xs text-muted-foreground">{h.name}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{h.kind}</Badge>
                    {h.cashEquivalent && (
                      <Badge variant="outline" className="ml-1">
                        counted in cash
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{h.accounts.map((a) => a.accountName).join(", ")}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUnits(h.units)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(h.price)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(h.value)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {h.cashEquivalent ? "—" : fmtPct(h.value / p.totalValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}
