const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fmtUsd = (n: number) => usd.format(n);
export const fmtUsd0 = (n: number) => usd0.format(n);
export const fmtPct = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`;
export const fmtUnits = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
