import express, { type Express, type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import { ConsultationError } from "@workspace/consultation";
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
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

app.use("/api", router);
const handleError: ErrorRequestHandler = (error, req, res, _next) => {
  const status = error instanceof ConsultationError ? error.status : error.name === "ZodError" || error.type === "entity.parse.failed" ? 400 : error.status === 413 ? 413 : 502;
  // Never log transcripts, provider request bodies, cookies or personal brief data.
  req.log.warn({ status, errorType: error.name ?? "Error" }, "Consultation request failed");
  res.status(status).json({ error: error instanceof ConsultationError ? error.message : status === 400 ? "Invalid request." : status === 413 ? "Request too large." : "The advisor could not complete this request. Your saved data is unchanged; please retry." });
};
app.use(handleError);

export default app;
