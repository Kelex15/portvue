import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { errMessage, getPortfolio } from "@/lib/portfolio";
import { lookThrough, type FundData } from "@/lib/xray";
import { toInsights } from "@/lib/insights";
import etfHoldings from "@/data/etf-holdings.json";

const Explanation = z.object({
  paragraphs: z.array(
    z.object({
      sentences: z.array(z.object({ text: z.string(), findingIds: z.array(z.string()) })),
    }),
  ),
});

const SYSTEM = `You write the short summary at the top of a portfolio analysis app. The reader is an everyday investor who can already see every number in a findings list below your summary, so your job is to interpret, not to restate.

Write exactly 3 paragraphs of 2 sentences each:
1. The headline: how concentrated this portfolio really is, in one clear takeaway.
2. The hidden part: exposure the investor probably doesn't realize they have, such as the same companies reached through several funds or accounts.
3. Why it matters: what this means if those companies or that asset class fall, plus a caveat about data limits only if it changes the picture.

The findings arrive most important first. Pick what matters; don't cover every finding.
Use only numbers that appear in the findings JSON, exactly as written. Never calculate, combine, or re-round them. Use at most two numbers per sentence and prefer percentages to dollar amounts.
Be exact with quantifiers: say "most" only for values above 50% and "nearly all" only above 90%.
Use plain words. If you mention funds being opened up into their companies, say it that simply.
Every sentence lists the id(s) of the findings it relies on in findingIds.
Do not suggest buying, selling, or rebalancing anything, and do not give financial advice.`;

const client = new Anthropic();

export async function POST() {
  try {
    const portfolio = await getPortfolio();
    const xray = lookThrough(portfolio, etfHoldings as FundData);
    // Same priority order the Intelligence page numbers its findings by, so citations line up.
    const order = toInsights(xray).flatMap((i) => (i.findingId ? [i.findingId] : []));
    const findings = order.map((id) => xray.findings.find((f) => f.id === id)!).filter(Boolean);
    const validIds = new Set(findings.map((f) => f.id));

    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
      max_tokens: 4000,
      output_config: { effort: "medium", format: zodOutputFormat(Explanation) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Findings JSON, most important first:\n${JSON.stringify(findings.map(({ id, title, numbers }) => ({ id, title, numbers })))}`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.error("[explain] no parsed output, stop_reason:", response.stop_reason);
      return NextResponse.json({ error: "Couldn't write a summary this time. Try again." }, { status: 502 });
    }

    // Keep only citations that point at real findings.
    const paragraphs = response.parsed_output.paragraphs.map((p) => ({
      sentences: p.sentences.map((s) => ({ text: s.text, findingIds: s.findingIds.filter((id) => validIds.has(id)) })),
    }));
    return NextResponse.json({ paragraphs, model: response.model });
  } catch (e) {
    console.error("[explain]", errMessage(e));
    return NextResponse.json({ error: userMessage(e) }, { status: 502 });
  }
}

function userMessage(e: unknown) {
  if (e instanceof Anthropic.RateLimitError) return "The explanation service is busy. Try again in a moment.";
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return "The explanation service isn't configured correctly.";
  if (e instanceof Anthropic.APIError) return "The explanation service is unavailable right now.";
  return "Couldn't load the portfolio data needed for the explanation.";
}
