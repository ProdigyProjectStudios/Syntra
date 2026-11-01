import { Router, type IRouter } from "express";
import { analyzeEvidence, evidenceInputSchema } from "../lib/evidence-ai";
import { reserveVisitorAnalysis } from "../lib/ai-usage";
import { ConsultationError } from "@workspace/consultation";

const router: IRouter = Router();

router.post("/evidence/analyze", async (req, res): Promise<void> => {
  const parsed = evidenceInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a decision and up to three text sources within the stated limits." });
    return;
  }

  await reserveVisitorAnalysis(res.locals.owner, "evidence", 4);

  try {
    const analysis = await analyzeEvidence(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    res.json(analysis);
  } catch (error) {
    if (error instanceof ConsultationError) throw error;
    req.log.error({ errorType: error instanceof Error ? error.name : "unknown" }, "Evidence analysis failed");
    res.status(502).json({ error: "Syntra could not review the evidence. Please try again." });
  }
});

export default router;
