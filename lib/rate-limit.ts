import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { takeAiCall } from "@/lib/store";

// Web search is billed per search on top of tokens, so it gets the tighter limit.
export const AI_LIMITS = {
  explain: { perHour: 6, perDay: 20, globalPerDay: 300 },
  drivers: { perHour: 3, perDay: 6, globalPerDay: 50 },
} as const;

// No login, so a visitor is identified by IP. Hosting proxies put the client first in x-forwarded-for.
function clientId(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns a 429 response when the visitor is over the limit, otherwise null and counts the call. */
export async function limitAiCall(req: NextRequest, bucket: keyof typeof AI_LIMITS): Promise<NextResponse | null> {
  const result = await takeAiCall(bucket, clientId(req), AI_LIMITS[bucket]);
  if (result.ok) return null;
  const minutes = Math.ceil(result.retryAfterSec / 60);
  const wait = minutes >= 60 ? `${Math.ceil(minutes / 60)} hours` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const error =
    result.scope === "global"
      ? "Portvue has reached today's limit for this feature. Try again later."
      : `Limit reached. Try again in ${wait}.`;
  return NextResponse.json(
    { error },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}
