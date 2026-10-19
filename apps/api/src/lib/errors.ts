import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Sign in to continue.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this.") => new HttpError(403, "forbidden", message);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found.`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
/** 402: the current plan doesn't allow this. The web app shows an upgrade prompt for this code. */
export const upgradeRequired = (message: string, details: { reason: string; feature?: string; limit?: number }) =>
  new HttpError(402, "upgrade_required", message, details);

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound("Route"));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const { fieldErrors, formErrors } = err.flatten();
    const firstField = Object.values(fieldErrors).flat()[0];
    res.status(400).json({
      error: {
        code: "validation_error",
        message: formErrors[0] ?? firstField ?? "Some fields are invalid.",
        fields: formErrors.length ? { ...fieldErrors, _errors: formErrors } : fieldErrors,
      },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err && (err as any).name === "MulterError") {
    const msg = (err as any).code === "LIMIT_FILE_SIZE" ? "That file is larger than 5 MB." : "The upload could not be read.";
    res.status(400).json({ error: { code: "bad_upload", message: msg } });
    return;
  }
  if (err && (err as any).type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "bad_json", message: "The request body isn't valid JSON." } });
    return;
  }
  // Prisma: unique constraint (P2002) and record-not-found (P2025)
  if (err && typeof err === "object" && (err as any).code === "P2002") {
    res.status(409).json({ error: { code: "conflict", message: "That value is already taken." } });
    return;
  }
  if (err && typeof err === "object" && (err as any).code === "P2025") {
    res.status(404).json({ error: { code: "not_found", message: "Not found." } });
    return;
  }
  (_req as any).log?.error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "internal", message: "Something went wrong on our side." } });
};
