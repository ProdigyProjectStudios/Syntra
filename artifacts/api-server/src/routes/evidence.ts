import { Router, type IRouter } from "express";
import { analyzeEvidence, evidenceInputSchema } from "../lib/evidence-ai";

const router: IRouter = Router();
const LIMIT = 4;
const WINDOW_MS = 60 * 60 * 1000;
const visitorWindows = new Map<string, { count: number; resetAt: number }>();

router.post("/evidence/analyze", async (req, res): Promise<void> => {
  const parsed = evidenceInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a decision and up to three text sources within the stated limits." });
    return;
  }

  const now = Date.now();
  if (visitorWindows.size >= 5000) {
    for (const [key, window] of visitorWindows) {
      if (window.resetAt <= now) visitorWindows.delete(key);
    }
  }
  const visitor = res.locals.visitorSessionHash as string;
  if (!visitorWindows.has(visitor) && visitorWindows.size >= 5000) {
    res.status(503).json({ error: "Evidence Room is busy. Please try again shortly." });
    return;
  }
  const current = visitorWindows.get(visitor);
  const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  if (window.count >= LIMIT) {
    res.setHeader("Retry-After", String(Math.ceil((window.resetAt - now) / 1000)));
    res.status(429).json({ error: "This session has reached the hourly evidence limit. Try again later." });
    return;
  }
  window.count += 1;
  visitorWindows.set(visitor, window);

  try {
    const analysis = await analyzeEvidence(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    res.json(analysis);
  } catch (error) {
    req.log.error({ errorType: error instanceof Error ? error.name : "unknown" }, "Evidence analysis failed");
    res.status(502).json({ error: "Syntra could not review the evidence. Please try again." });
  }
});

export default router;
