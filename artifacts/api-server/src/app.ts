import express, { type Express, type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import { ConsultationError, BlueprintVersionConflict, BlueprintChangeRejected } from "@workspace/consultation";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use(cookieParser());
app.use(express.json({ limit: "96kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

app.use("/api", router);
const handleError: ErrorRequestHandler = (error, req, res, _next) => {
  const status = error instanceof ConsultationError ? error.status : error.name === "ZodError" || error.type === "entity.parse.failed" ? 400 : error.status === 413 ? 413 : 502;
  // Never log transcripts, provider request bodies, cookies or personal brief data.
  const reason = error instanceof ConsultationError && status === 429
    ? error.message.startsWith("Syntra's daily AI allowance") ? "daily_ai_allowance"
      : error.message.startsWith("Syntra's shared AI allowance") ? "shared_ai_allowance"
      : error.message === "Please wait a minute before sending more messages." ? "visitor_message_rate" : "other_rate_limit"
    : undefined;
  req.log.warn({ status, errorType: error.name ?? "Error", ...(reason ? { reason } : {}) }, "Consultation request failed");
  if (reason === "daily_ai_allowance") {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((Math.ceil((Date.now() + 1) / 86_400_000) * 86_400_000 - Date.now()) / 1000))));
  }
  res.status(status).json({ ...(error instanceof BlueprintVersionConflict || error instanceof BlueprintChangeRejected ? { code: error.code } : {}), error: error instanceof ConsultationError ? error.message : status === 400 ? "Invalid request." : status === 413 ? "Request too large." : "The request outcome could not be confirmed. Your saved conversation is available; retry the original request to confirm its outcome." });
};
app.use(handleError);

export default app;
