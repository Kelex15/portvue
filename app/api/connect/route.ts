import { NextResponse } from "next/server";
import { snaptrade } from "@/lib/snaptrade";

export async function GET() {
  try {
    const { data } = await snaptrade.authentication.loginSnapTradeUser({
      broker: "SANDBOX",
      connectionType: "read",
      customRedirect: "http://localhost:3000/?connected=1",
    });
    if (!("redirectURI" in data) || !data.redirectURI) {
      return NextResponse.json({ error: "No redirectURI in SnapTrade response", data }, { status: 502 });
    }
    return NextResponse.redirect(data.redirectURI);
  } catch (err) {
    const e = err as { message?: string; responseBody?: unknown };
    return NextResponse.json({ error: e.message, details: e.responseBody }, { status: 502 });
  }
}
