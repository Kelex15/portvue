import { lookThrough, type FundData } from "@/lib/xray";
import { allocation } from "@/lib/allocation";
import etfHoldings from "@/data/etf-holdings.json";
import { PortfolioGate } from "@/components/portfolio-gate";
import { PageHeader } from "@/components/portvue/kit";
import { ExposureWorkspace } from "@/components/portvue/exposure-workspace";

export const dynamic = "force-dynamic";

export default async function ExposurePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  return (
    <>
      <PageHeader
        title="Exposure"
        subtitle="What you really own once funds are opened up."
      />
      <PortfolioGate>
        {(p) => (
          <ExposureWorkspace
            key={company ?? "default"}
            xray={lookThrough(p, etfHoldings as FundData)}
            allocation={allocation(p)}
            initialCompany={company}
          />
        )}
      </PortfolioGate>
    </>
  );
}
