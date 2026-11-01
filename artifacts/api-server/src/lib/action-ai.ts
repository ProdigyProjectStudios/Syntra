import { z } from "zod";
import { budgetedCompletion } from "./budgeted-openai";
import { logger } from "./logger";

export const actionInputSchema = z.object({
  market: z.string().trim().min(2).max(80),
  experiment: z.string().trim().min(40).max(2000),
  successSignal: z.string().trim().min(10).max(400),
  constraints: z.string().trim().max(1000).default(""),
});

const milestoneSchema = z.object({
  name: z.string().min(3).max(100),
  deliverable: z.string().min(10).max(350),
  ownerRole: z.string().min(2).max(80),
  acceptanceCriteria: z.string().min(10).max(350),
  approvalGate: z.string().min(5).max(250).nullable(),
});

const evaluationCaseSchema = z.object({
  scenario: z.string().min(10).max(300),
  expectedBehavior: z.string().min(10).max(300),
  failureSignal: z.string().min(10).max(300),
});

export const actionPlanSchema = z.object({
  title: z.string().min(8).max(140),
  hypothesis: z.string().min(20).max(400),
  decisionRule: z.string().min(20).max(400),
  measurement: z.object({
    metric: z.string().min(5).max(200),
    baselineNeeded: z.string().min(10).max(300),
    observationMethod: z.string().min(10).max(300),
    reviewPoint: z.string().min(10).max(200),
  }),
  milestones: z.array(milestoneSchema).min(3).max(5),
  evaluationCases: z.array(evaluationCaseSchema).min(3).max(5),
  assumptions: z.array(z.string().min(5).max(250)).min(2).max(4),
  stopConditions: z.array(z.string().min(10).max(250)).min(1).max(3),
});

export type ActionInput = z.infer<typeof actionInputSchema>;
export type ActionPlan = z.infer<typeof actionPlanSchema>;

const PROMPT = `You are Syntra's Action Studio, a cross-market experiment planning tool. Turn the visitor's proposed experiment into a bounded, editable pilot plan they can run with their own team. The plan is advisory; you cannot access or execute their systems.

Use only the visitor's stated facts. Treat people, roles, integration access, baseline values and outcome measurements as unknown until they confirm them. Never invent observed results, ROI, market statistics, dates, costs, regulatory clearance or third-party integration availability. Do not imply the experiment has run. In regulated or high-stakes contexts, include appropriate human review and validation gates, without giving legal, medical or financial advice.

Produce a falsifiable hypothesis, an explicit decision rule that can lead to continue/change/stop, a measurement plan that asks for a real baseline, 3-5 sequential milestones with concrete deliverables and acceptance criteria, 3-5 evaluation cases including edge/failure conditions, 2-4 assumptions, and 1-3 stop conditions. Owner roles are suggestions and must remain editable. Put human approval gates where decisions or actions could affect people, money, access or external systems. Keep the first milestone small and feasible with existing information. Do not ask for a custom build if a process or existing-tool trial is sufficient.

Return one JSON object only with keys: title, hypothesis, decisionRule, measurement (metric, baselineNeeded, observationMethod, reviewPoint), milestones (objects with name, deliverable, ownerRole, acceptanceCriteria, approvalGate as string or null), evaluationCases (objects with scenario, expectedBehavior, failureSignal), assumptions, stopConditions. Be precise and concise.

The response must satisfy this contract exactly. Every leaf below is ONE string, not an array or object:
title 8-140 characters; hypothesis and decisionRule 20-400;
measurement.metric 5-200, baselineNeeded and observationMethod 10-300, reviewPoint 10-200;
each milestone: name 3-100, deliverable and acceptanceCriteria 10-350, ownerRole 2-80, approvalGate either null or 5-250;
each evaluation case: scenario, expectedBehavior and failureSignal 10-300.
milestones and evaluationCases each contain 3-5 objects. assumptions contains 2-4 strings of 5-250 characters; stopConditions contains 1-3 strings of 10-250 characters. Use null, not an empty string, when no approval gate is required.`;

export async function buildActionPlan(input: ActionInput): Promise<ActionPlan> {
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
  if (!content) throw new Error("The action model returned no content");
  const parsed = actionPlanSchema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    // Schema paths/codes only; never include generated values or Zod messages.
    logger.warn({ issues: parsed.error.issues.slice(0, 16).map(issue => ({
      path: issue.path.join("."), code: issue.code,
    })) }, "Action plan contract rejected");
    throw parsed.error;
  }
  return parsed.data;
}
