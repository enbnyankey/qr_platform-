import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { config } from "../../config";
import { requireAuth, requireOrg } from "../../lib/auth";
import { badRequest } from "../../lib/errors";
import { randomCode } from "../../lib/util";

/**
 * Image and document uploads for logos, menu photos and document QR codes.
 * Phase 1 stores files on local disk under apps/api/uploads; swap for S3-compatible
 * object storage before production (same response shape).
 */
const ALLOWED: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "application/pdf": ".pdf",
};

fs.mkdirSync(config.uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(config.uploadsDir, String(req.params.orgId));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomCode(6)}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(badRequest("Upload a PNG, JPG, WebP or PDF file."))),
});

export const uploadsRouter = Router({ mergeParams: true });

uploadsRouter.post("/", requireAuth, requireOrg(["business_owner", "manager"]), upload.single("file"), (req, res) => {
  if (!req.file) throw badRequest("Choose a file to upload.");
  // Served by the API at /uploads/...; the web app proxies /api/* so the browser path is /api/uploads/...
  res.status(201).json({ path: `/uploads/${String(req.params.orgId)}/${req.file.filename}`, size: req.file.size, mimeType: req.file.mimetype });
});
