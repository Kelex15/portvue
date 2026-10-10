import { NextResponse, type NextRequest } from "next/server";
import { snaptrade } from "@/lib/snaptrade";

export async function GET(req: NextRequest) {
  // Return to whichever host served this request (localhost or the deployment); APP_URL overrides it.
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  try {
    const { data } = await snaptrade.authentication.loginSnapTradeUser({
      broker: "SANDBOX",
      connectionType: "read",
      customRedirect: `${appUrl}/?connected=1`,
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
