import { Router, type IRouter } from "express";
import { analyzeOpportunity, opportunityInputSchema } from "../lib/opportunity-ai";

const router: IRouter = Router();
const LIMIT = 6;
const WINDOW_MS = 60 * 60 * 1000;
const visitorWindows = new Map<string, { count: number; resetAt: number }>();

router.post("/opportunity/analyze", async (req, res): Promise<void> => {
  const parsed = opportunityInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Describe the challenge in at least 40 characters and keep inputs within the stated limits." });
    return;
  }

  // A bounded local guard for the public pilot. A shared store is required across replicas.
  const now = Date.now();
  if (visitorWindows.size >= 5000) {
    for (const [key, window] of visitorWindows) {
      if (window.resetAt <= now) visitorWindows.delete(key);
    }
  }
  const visitor = res.locals.visitorSessionHash as string;
  if (!visitorWindows.has(visitor) && visitorWindows.size >= 5000) {
    res.status(503).json({ error: "Decision Lab is busy. Please try again shortly." });
    return;
  }
  const current = visitorWindows.get(visitor);
  const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  if (window.count >= LIMIT) {
    res.setHeader("Retry-After", String(Math.ceil((window.resetAt - now) / 1000)));
    res.status(429).json({ error: "This session has reached the hourly analysis limit. Try again later." });
    return;
  }
  window.count += 1;
  visitorWindows.set(visitor, window);

  try {
    const analysis = await analyzeOpportunity(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    res.json(analysis);
  } catch (error) {
    req.log.error({ error }, "Opportunity analysis failed");
    res.status(502).json({ error: "Syntra could not complete this analysis. Please try again." });
  }
});

export default router;
