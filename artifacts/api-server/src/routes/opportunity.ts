import { Router, type IRouter } from "express";
import { analyzeOpportunity, opportunityInputSchema } from "../lib/opportunity-ai";
import { reserveVisitorAnalysis } from "../lib/ai-usage";
import { ConsultationError } from "@workspace/consultation";

const router: IRouter = Router();

router.post("/opportunity/analyze", async (req, res): Promise<void> => {
  const parsed = opportunityInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Describe the challenge in at least 40 characters and keep inputs within the stated limits." });
    return;
  }

  await reserveVisitorAnalysis(res.locals.owner, "opportunity", 6);

  try {
    const analysis = await analyzeOpportunity(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    res.json(analysis);
  } catch (error) {
    if (error instanceof ConsultationError) throw error;
    req.log.error({ errorType: error instanceof Error ? error.name : "unknown" }, "Opportunity analysis failed");
    res.status(502).json({ error: "Syntra could not complete this analysis. Please try again." });
  }
});

export default router;
