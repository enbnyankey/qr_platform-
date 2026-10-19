import crypto from "crypto";
import type { Request } from "express";
import { Db, prisma } from "../db";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Random, non-sequential short code for QR URLs (62^8 ≈ 2.2e14 possibilities). */
export function randomCode(length = 8): string {
  const bytes = crypto.randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 248) out += BASE62[b % 62]; // rejection sampling keeps the distribution uniform
  }
  return out.length === length ? out : randomCode(length);
}

export function randomOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org"
  );
}

/** JSON-safe copy of a record (BigInt → string), for audit snapshots and API responses. */
export function toJson<T>(value: T): unknown {
  return value === undefined || value === null
    ? null
    : JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export async function audit(
  req: Request,
  entry: { orgId?: string | null; action: string; entity: string; entityId?: string; before?: unknown; after?: unknown },
  db: Db = prisma,
) {
  await db.auditLog.create({
    data: {
      orgId: entry.orgId ?? null,
      actorId: req.user?.id ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: (toJson(entry.before) ?? undefined) as any,
      after: (toJson(entry.after) ?? undefined) as any,
      ip: req.ip ?? null,
    },
  });
}
