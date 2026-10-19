import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { config } from "./config";
import { prisma } from "./db";
import { httpLogger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { adminRouter } from "./modules/admin/routes";
import { authRouter } from "./modules/auth/routes";
import { eventsRouter } from "./modules/events/routes";
import { helpRouter } from "./modules/help/routes";
import { menusRouter } from "./modules/menus/routes";
import { publicRouter } from "./modules/menus/public";
import { orgsRouter } from "./modules/orgs/routes";
import { qrRouter } from "./modules/qr/routes";
import { uploadsRouter } from "./modules/uploads/routes";
import { billingRouter, testPaymentsRouter, webhooksRouter } from "./modules/billing/routes";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(httpLogger);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // Keep the raw body too: payment webhooks are verified against the exact bytes received.
  app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => ((req as any).rawBody = buf) }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "api" });
  });

  app.use("/uploads", express.static(config.uploadsDir, { maxAge: "7d", fallthrough: false }));

  app.use("/auth", authRouter);
  app.use("/public", publicRouter);
  app.use("/orgs", orgsRouter);
  app.use("/orgs/:orgId/qr", qrRouter);
  app.use("/orgs/:orgId/menus", menusRouter);
  app.use("/orgs/:orgId/events", eventsRouter);
  app.use("/orgs/:orgId/uploads", uploadsRouter);
  app.use("/orgs/:orgId/billing", billingRouter);
  app.use("/webhooks", webhooksRouter);
  app.use("/public/test-payments", testPaymentsRouter);
  app.use("/help", helpRouter);
  app.use("/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
