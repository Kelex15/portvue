import { getPortfolio, type Portfolio } from "@/lib/portfolio";
import { ErrorState, Panel } from "@/components/portvue/kit";

// Loads the portfolio and renders the error / empty states, so each page only handles the happy path.
export async function PortfolioGate({ children }: { children: (p: Portfolio) => React.ReactNode }) {
  let portfolio: Portfolio;
  try {
    portfolio = await getPortfolio();
  } catch (e) {
    const err = e as { message?: string; responseBody?: unknown };
    return (
      <ErrorState
        title="Couldn't load accounts from SnapTrade"
        detail={`${err.message ?? String(e)}${err.responseBody ? ` ${JSON.stringify(err.responseBody)}` : ""}`}
      />
    );
  }

  if (portfolio.accounts.length === 0) {
    return (
      <Panel title="No accounts connected yet">
        <p className="text-muted-foreground">
          <a href="/api/connect" className="font-medium text-primary hover:underline">
            Connect a brokerage account
          </a>{" "}
          to see your holdings.
        </p>
      </Panel>
    );
  }

  return (
    <>
      {portfolio.warnings.length > 0 && (
        <ErrorState title="Some positions were left out" detail={portfolio.warnings.join(" · ")} />
      )}
      {children(portfolio)}
    </>
  );
}
