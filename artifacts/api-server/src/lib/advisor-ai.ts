import { openai } from "@workspace/integrations-openai-ai-server";
import { SERVICE_AREAS } from "./advisor-data";

export type Depth = "concise" | "detailed" | "deep_dive";

export interface BriefFields {
  objective: string | null;
  service: string | null;
  proposedSolution: string | null;
  requirements: string | null;
  integrations: string | null;
  budget: string | null;
  timeline: string | null;
  nextStep: string | null;
}

export interface AdvisorResult {
  reply: string;
  brief: Partial<BriefFields>;
  suggestedNextSteps: string[];
  title?: string;
}

const DEPTH_GUIDANCE: Record<Depth, string> = {
  concise:
    "Respond in at most 3 short sentences. Be direct, warm, and precise. Ask exactly one focused follow-up question.",
  detailed:
    "Respond with 1-3 short paragraphs. Give useful substance — name directions, trade-offs, or likely first releases — and end with one clear question that moves the brief forward.",
  deep_dive:
    "Respond with a thorough, structured exploration (up to ~400 words): frame the problem, compare practical build directions, surface risks and unknowns, and recommend a smallest useful first release. Use short paragraphs with markdown bold for key phrases. End with the single most important open question.",
};

const SYSTEM_PROMPT = `You are the Digital Prodigy build advisor — an AI consultant inside Digital Prodigy's website. Digital Prodigy is an AI-first product studio that designs and builds software for clients.

Digital Prodigy works across four service areas:
${SERVICE_AREAS.map((s) => `- ${s.name}: ${s.description}`).join("\n")}

Your job: help a visitor turn a vague idea into a clear, scoped first build. You shape ideas, untangle workflow bottlenecks, and compare practical build directions. You keep the first release small and the unknowns provisional. You never need a polished spec or budget to start.

Rules:
- Only record brief fields that were explicitly discussed or clearly marked as a direction by the visitor. Never invent details.
- This advisor has no connected calendar and cannot book or confirm a time, submit an enquiry, or send a message on the visitor's behalf. If asked to book, warmly direct them to Digital Prodigy's Contact page.
- Never use emojis.
- Tone: precise, calm, confident — a senior product engineer who respects the visitor's time.

You MUST respond with a single JSON object (no markdown fences) of this exact shape:
{
  "reply": string,              // your message to the visitor, honouring the depth guidance
  "brief": {                    // only include fields established so far; omit or null the rest
    "objective": string | null,
    "service": string | null,          // one of the four service area names, if a direction fits
    "proposedSolution": string | null,
    "requirements": string | null,
    "integrations": string | null,
    "budget": string | null,
    "timeline": string | null,
    "nextStep": string | null
  },
  "suggestedNextSteps": string[],  // 2-3 short follow-up prompts the visitor could tap, phrased in their voice
  "title": string | null           // a 3-6 word conversation title; only set on the first visitor message, else null
}`;

const BRIEF_KEYS: (keyof BriefFields)[] = [
  "objective",
  "service",
  "proposedSolution",
  "requirements",
  "integrations",
  "budget",
  "timeline",
  "nextStep",
];

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Advisor response did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function runAdvisor(params: {
  history: { role: "visitor" | "advisor"; content: string }[];
  currentBrief: BriefFields;
  depth: Depth;
  isFirstMessage: boolean;
}): Promise<AdvisorResult> {
  const { history, currentBrief, depth, isFirstMessage } = params;

  const briefState = BRIEF_KEYS.map((k) => `${k}: ${currentBrief[k] ?? "not established"}`).join(
    "\n",
  );

  const response = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `Response depth for this turn: ${depth}. ${DEPTH_GUIDANCE[depth]}` },
      {
        role: "system",
        content: `Current working brief state:\n${briefState}\n\nMerge new information into this brief; keep established fields unless the visitor changes them.${
          isFirstMessage
            ? "\nThis is the visitor's first message — also set a short conversation title."
            : "\nSet title to null."
        }`,
      },
      ...history.map((m) => ({
        role: (m.role === "visitor" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      })),
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = extractJson(raw) as Record<string, unknown>;

  const brief: Partial<BriefFields> = {};
  const rawBrief = (parsed.brief ?? {}) as Record<string, unknown>;
  for (const key of BRIEF_KEYS) {
    const value = rawBrief[key];
    if (typeof value === "string" && value.trim().length > 0) {
      brief[key] = value.trim();
    }
  }

  const steps = Array.isArray(parsed.suggestedNextSteps)
    ? parsed.suggestedNextSteps.filter((s): s is string => typeof s === "string").slice(0, 3)
    : [];

  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim().length > 0
      ? parsed.reply.trim()
      : "I didn't quite catch that — could you tell me a little more about what you're hoping to build?";

  return {
    reply,
    brief,
    suggestedNextSteps: steps,
    title:
      isFirstMessage && typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : undefined,
  };
}
