import { lookThrough, type FundData } from "@/lib/xray";
import { toInsights } from "@/lib/insights";
import etfHoldings from "@/data/etf-holdings.json";
import { PortfolioGate } from "@/components/portfolio-gate";
import { PageHeader, PanelLink } from "@/components/portvue/kit";
import { IntelligenceWorkspace } from "@/components/portvue/intelligence-workspace";

export const dynamic = "force-dynamic";

export default function IntelligencePage() {
  return (
    <>
      <PageHeader
        title="Intelligence"
        subtitle="What stands out in your portfolio, with the evidence."
        actions={<PanelLink href="/events">Market events</PanelLink>}
      />
      <PortfolioGate>
        {(p) => {
          const xray = lookThrough(p, etfHoldings as FundData);
          return <IntelligenceWorkspace insights={toInsights(xray)} findings={xray.findings} />;
        }}
      </PortfolioGate>
    </>
  );
}
