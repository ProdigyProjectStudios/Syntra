import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE = "syntra.sid";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function visitorSession(req: Request, res: Response, next: NextFunction): void {
  let token = typeof req.cookies?.[COOKIE] === "string" ? req.cookies[COOKIE] as string : undefined;
  if (!token || !TOKEN_PATTERN.test(token)) {
    token = randomBytes(32).toString("base64url");
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/api",
    });
  }
  res.locals.visitorSessionHash = createHash("sha256").update(token).digest("hex");
  next();
}
