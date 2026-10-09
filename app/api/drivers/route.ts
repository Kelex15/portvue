import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { errMessage, getPortfolio } from "@/lib/portfolio";
import { lookThrough, type FundData } from "@/lib/xray";
import { computeMoves } from "@/lib/moves";
import { marketDate, readDrivers, writeDrivers } from "@/lib/store";
import etfHoldings from "@/data/etf-holdings.json";

export type DriverBlock = { text: string; citations: { url: string; title: string | null }[] };
type DriversResult = { blocks: DriverBlock[]; drivers: string[]; model?: string };

const SYSTEM = `You look for news that may explain recent price moves of specific stocks or funds.
You receive the computed moves as JSON. Every number was computed by the app; you never calculate or introduce numbers that are not in the JSON or in a cited source.
Use web search to find news from the stated period for each driver symbol. For each driver, write 1-3 short sentences starting with the symbol, describing POSSIBLE drivers.
Never claim causation: write "may reflect", "coincided with", "possible driver", never "caused" or "because of".
Every factual claim about news must come from a search result you cite. If you find nothing relevant for a symbol, say so plainly.
Do not recommend buying or selling anything and do not give financial advice.`;

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { period: rawPeriod } = await req.json().catch(() => ({}));
  const period = rawPeriod === "week" ? "week" : "day";
  try {
    const portfolio = await getPortfolio();
    const report = await computeMoves(portfolio, lookThrough(portfolio, etfHoldings as FundData), period);
    const drivers = report.holdings.filter((h) => report.topDrivers.includes(h.symbol));
    if (drivers.length === 0) return NextResponse.json({ blocks: [], drivers: [] } satisfies DriversResult);

    // Web searches cost money; one answer per period, market day and driver set is enough.
    const driverSet = report.topDrivers.join(",");
    const stored = readDrivers<DriversResult>(period, driverSet);
    if (stored) return NextResponse.json(stored);

    const periodText =
      period === "day" ? `today (${marketDate()})` : `the past week (since ${drivers[0].since ?? "5 trading days ago"})`;
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Period: ${periodText}.\nDrivers JSON:\n${JSON.stringify(
          drivers.map(({ symbol, name, pctMove, impactUsd, shareOfMovement }) => ({
            symbol,
            name,
            pctMove,
            impactUsd,
            shareOfMovement,
          })),
        )}`,
      },
    ];

    let response: Anthropic.Message | null = null;
    const content: Anthropic.ContentBlock[] = [];
    // Server tools can pause a long turn; resume it a couple of times at most.
    for (let i = 0; i < 3; i++) {
      response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages,
      });
      content.push(...response.content);
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }

    const blocks: DriverBlock[] = content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => ({
        text: b.text,
        citations: (b.citations ?? [])
          .filter((c): c is Anthropic.CitationsWebSearchResultLocation => c.type === "web_search_result_location")
          .map((c) => ({ url: c.url, title: c.title })),
      }));

    const result: DriversResult = { blocks, drivers: report.topDrivers, model: response?.model };
    writeDrivers(period, driverSet, result);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[drivers]", errMessage(e));
    const msg =
      e instanceof Anthropic.RateLimitError
        ? "The news search is busy. Try again in a moment."
        : e instanceof Anthropic.APIError
          ? "The news search is unavailable right now."
          : "Couldn't load price moves right now.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
