import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";

/** Opaque browser capability, stored only in an HttpOnly cookie. DB stores its hash, not the bearer. */
export const privateSession: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // CSRF: API calls must originate from this preview/host, not an arbitrary third-party site.
  const origin = req.get("origin");
  if (origin) {
    const host = req.get("x-forwarded-host")?.split(",")[0].trim() || req.get("host");
    try {
      if (new URL(origin).host !== host) { res.status(403).json({ error: "Cross-origin requests are not allowed." }); return; }
    } catch { res.status(403).json({ error: "Invalid origin." }); return; }
  }
  let token: string | undefined = req.cookies?.["syntra.session"];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    const secure = req.secure || req.get("x-forwarded-proto")?.split(",")[0] === "https";
    res.cookie("syntra.session", token, { httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: "/api", maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
  res.locals.owner = createHash("sha256").update(token).digest("hex");
  next();
};
