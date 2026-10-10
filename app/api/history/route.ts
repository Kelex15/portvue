import { NextResponse } from "next/server";
import { errMessage, getPortfolio } from "@/lib/portfolio";
import { computeHistory } from "@/lib/history";

// First fetch of the day spaces Alpha Vantage calls 12.5s apart (free-tier limit).
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json(await computeHistory(await getPortfolio()));
  } catch (e) {
    console.error("[history]", errMessage(e));
    return NextResponse.json({ error: "Couldn't load price history right now." }, { status: 502 });
  }
}
