import Link from "next/link";
import { getPortfolio, type Portfolio } from "@/lib/portfolio";
import { lookThrough, type FundData } from "@/lib/xray";
import etfHoldings from "@/data/etf-holdings.json";
import { LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Search, type SearchItem } from "@/components/shell/search";

function searchIndex(p: Portfolio): SearchItem[] {
  const xray = lookThrough(p, etfHoldings as FundData);
  const exposureHref = (key: string) => `/exposure?company=${encodeURIComponent(key)}`;
  const companyOf = new Map<string, string>();
  for (const e of xray.exposures) for (const c of e.contributions) companyOf.set(c.heldSymbol, e.key);

  const items: SearchItem[] = xray.exposures.map((e) => ({
    label: e.label,
    sub: `${(e.pct * 100).toFixed(1)}% exposure · ${[...new Set(e.contributions.map((c) => c.heldSymbol))].join(", ")}`,
    href: exposureHref(e.key),
  }));
  for (const h of p.holdings) {
    const key = companyOf.get(h.symbol);
    items.push({
      label: h.symbol,
      sub: `${h.name} · ${h.accounts.map((a) => a.accountName).join(", ")}`,
      href: key ? exposureHref(key) : "/portfolio",
    });
  }
  return items;
}

export async function Topbar() {
  const portfolio = await getPortfolio().catch(() => null);
  const synced = portfolio ? new Date(portfolio.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="lg:hidden" aria-label="Portvue home">
          <LogoMark tile />
        </Link>
        <Search items={portfolio ? searchIndex(portfolio) : []} />
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className={portfolio ? "size-1.5 rounded-full bg-positive" : "size-1.5 rounded-full bg-negative"} />
            {portfolio ? `SnapTrade synced ${synced}` : "SnapTrade not synced"}
          </span>
          <span className="lg:hidden">
            <ThemeToggle />
          </span>
        </div>
      </div>
    </header>
  );
}
