import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { errMessage, getPortfolio } from "@/lib/portfolio";
import { lookThrough, type FundData } from "@/lib/xray";
import etfHoldings from "@/data/etf-holdings.json";

const Explanation = z.object({
  paragraphs: z.array(
    z.object({
      sentences: z.array(z.object({ text: z.string(), findingIds: z.array(z.string()) })),
    }),
  ),
});

const SYSTEM = `You explain a portfolio analysis to an everyday investor in plain language.
You receive findings as JSON. Every number was computed by the app; you never calculate, estimate, round differently, or introduce any number that is not in the JSON.
Write exactly 3 short paragraphs (2-3 sentences each) about the most important findings: what is concentrated, what overlaps without being obvious, and why that matters for risk.
Every sentence must list the id(s) of the finding(s) it relies on in findingIds.
Fund look-through uses a dated snapshot of each fund's top holdings, so company figures are lower bounds; say so where relevant.
Do not recommend buying, selling, or rebalancing anything, and do not give financial advice.`;

const client = new Anthropic();

export async function POST() {
  try {
    const portfolio = await getPortfolio();
    const { findings } = lookThrough(portfolio, etfHoldings as FundData);
    const validIds = new Set(findings.map((f) => f.id));

    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Explanation) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Findings JSON:\n${JSON.stringify(findings.map(({ id, title, numbers }) => ({ id, title, numbers })))}`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: `Claude returned no explanation (stop_reason: ${response.stop_reason}).` }, { status: 502 });
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
