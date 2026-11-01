import { z } from "zod";
import { budgetedCompletion } from "./budgeted-openai";

export const opportunityInputSchema = z.object({
  market: z.string().trim().min(2).max(80),
  challenge: z.string().trim().min(40).max(3000),
  constraints: z.string().trim().max(1000).default(""),
});

const routeSchema = z.object({
  name: z.string().min(3).max(80),
  approach: z.string().min(20).max(700),
  firstRelease: z.string().min(20).max(700),
  effort: z.enum(["LOW", "MEDIUM", "HIGH"]),
  mainRisk: z.string().min(10).max(500),
  tradeoff: z.string().min(10).max(500),
});

export const opportunityAnalysisSchema = z.object({
  headline: z.string().min(8).max(160),
  diagnosis: z.string().min(30).max(900),
  valueAtStake: z.string().min(20).max(500),
  routes: z.array(routeSchema).length(3),
  recommendedRoute: z.number().int().min(0).max(2),
  recommendationReason: z.string().min(20).max(700),
  firstExperiment: z.string().min(20).max(700),
  successSignal: z.string().min(10).max(400),
  assumptions: z.array(z.string().min(5).max(300)).min(2).max(4),
  questions: z.array(z.string().min(5).max(300)).min(2).max(4),
  adjacentMarkets: z.array(z.object({
    market: z.string().min(2).max(80),
    transfer: z.string().min(20).max(400),
  })).length(2),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  confidenceReason: z.string().min(15).max(400),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;
export type OpportunityAnalysis = z.infer<typeof opportunityAnalysisSchema>;

const PROMPT = `You are Syntra, a decision intelligence tool for people evaluating an AI or software opportunity. This tool serves teams in many markets, independently of Digital Prodigy's consulting services.

Produce a useful decision canvas from the visitor's own description. Compare exactly three meaningfully different approaches: a small process improvement or existing-tool route, a bounded AI-assisted route, and a deeper custom system route. The first route should never be a straw man. Recommend the path with the best near-term learning and practical value given the stated constraints, even when that means no custom build.

Separate visitor facts from your assumptions. Never invent ROI figures, market statistics, regulatory clearance, implementation time estimates, or evidence that a tool already integrates with their systems. In healthcare, finance and other high-stakes contexts, identify human oversight and validation needs without presenting legal, medical or financial advice. If context is thin, lower confidence and ask decisive questions. Adjacent markets are transferable patterns, not claims that those markets have identical economics.

Return one JSON object only, with keys: headline, diagnosis, valueAtStake, routes (exactly 3 objects with name, approach, firstRelease, effort LOW/MEDIUM/HIGH, mainRisk, tradeoff), recommendedRoute (zero-based index), recommendationReason, firstExperiment, successSignal, assumptions (2-4), questions (2-4), adjacentMarkets (exactly 2 objects with market and transfer), confidence (LOW/MEDIUM/HIGH), confidenceReason. Make each field concise and concrete.`;

export async function analyzeOpportunity(input: OpportunityInput): Promise<OpportunityAnalysis> {
  const response = await budgetedCompletion({
    model: "gpt-5.6-terra",
    max_completion_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: JSON.stringify(input) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The analysis model returned no content");
  return opportunityAnalysisSchema.parse(JSON.parse(content));
}
