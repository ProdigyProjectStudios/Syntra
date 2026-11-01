import { Router, type IRouter } from "express";
import { actionInputSchema, buildActionPlan } from "../lib/action-ai";
import { reserveVisitorAnalysis } from "../lib/ai-usage";
import { ConsultationError } from "@workspace/consultation";

const router: IRouter = Router();

router.post("/action/plan", async (req, res): Promise<void> => {
  const parsed = actionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Describe the experiment and success signal within the stated limits." });
    return;
  }

  await reserveVisitorAnalysis(res.locals.owner, "action", 4);

  try {
    const plan = await buildActionPlan(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    res.json(plan);
  } catch (error) {
    if (error instanceof ConsultationError) throw error;
    req.log.error({ errorType: error instanceof Error ? error.name : "unknown" }, "Action plan generation failed");
    res.status(502).json({ error: "Syntra could not complete the plan. Please try again." });
  }
});

export default router;
