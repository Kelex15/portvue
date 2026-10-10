import type { Portfolio } from "@/lib/portfolio";

export type AssetClass = "Stocks" | "Funds" | "Crypto" | "Cash";
export type Allocation = { assetClass: AssetClass; value: number; pct: number; symbols: string[] };

// Fixed order so each class keeps its chart color.
export const ASSET_CLASSES: AssetClass[] = ["Stocks", "Funds", "Crypto", "Cash"];

const classOf = (kind: string): AssetClass =>
  kind === "stock" ? "Stocks" : kind === "etf" || kind === "mutualfund" ? "Funds" : kind === "crypto" ? "Crypto" : "Stocks";

export function allocation(p: Portfolio): Allocation[] {
  const by = new Map<AssetClass, { value: number; symbols: string[] }>(ASSET_CLASSES.map((c) => [c, { value: 0, symbols: [] }]));
  for (const h of p.holdings) {
    if (h.cashEquivalent) continue; // counted inside cash balances already
    const slot = by.get(classOf(h.kind))!;
    slot.value += h.value;
    slot.symbols.push(h.symbol);
  }
  by.get("Cash")!.value += p.cash;
  return ASSET_CLASSES.map((c) => ({ assetClass: c, ...by.get(c)!, pct: by.get(c)!.value / p.totalValue })).filter((a) => a.value > 0);
}
