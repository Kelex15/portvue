import { NextResponse, type NextRequest } from "next/server";
import { errMessage, getPortfolio } from "@/lib/portfolio";
import { lookThrough, type FundData } from "@/lib/xray";
import { computeMoves } from "@/lib/moves";
import etfHoldings from "@/data/etf-holdings.json";

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") === "week" ? "week" : "day";
  try {
    const portfolio = await getPortfolio();
    const report = await computeMoves(portfolio, lookThrough(portfolio, etfHoldings as FundData), period);
    return NextResponse.json(report);
  } catch (e) {
    console.error("[moves]", errMessage(e));
    return NextResponse.json({ error: "Couldn't load price moves right now." }, { status: 502 });
  }
}
