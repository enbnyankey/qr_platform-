import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { config } from "../config";

/**
 * Structured JSON logs (one line per event) so production logs can be searched and
 * shipped to a log service. Pretty, readable output in development.
 */
export const logger = pino({
  level: config.isTest ? "silent" : process.env.LOG_LEVEL ?? "info",
  base: { service: "api" },
  redact: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.passwordHash"],
  transport: config.env === "development" ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,service" } } : undefined,
});

/** Request logging with a request ID that is also returned in the X-Request-Id header. */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = (req.headers["x-request-id"] as string) || randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url === "/health" },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
