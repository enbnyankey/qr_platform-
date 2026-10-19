import type { RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../db";
import { forbidden, unauthorized } from "./errors";

export const SESSION_COOKIE = "qr_session";

export type Role = "business_owner" | "manager" | "cashier" | "kitchen" | "scanner" | "accountant" | "support";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      org?: { id: string; role: Role | "super_admin"; currency: string };
    }
  }
}

export function signSession(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtTtl as jwt.SignOptions["expiresIn"] });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.env === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Reads the session from the httpOnly cookie (or a Bearer token for API clients). */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = req.cookies?.[SESSION_COOKIE] ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) return next(unauthorized());
  let sub: string;
  try {
    sub = (jwt.verify(token, config.jwtSecret) as jwt.JwtPayload).sub as string;
  } catch {
    return next(unauthorized("Your session has expired. Sign in again."));
  }
  const user = await prisma.user.findUnique({
    where: { id: sub },
    select: { id: true, email: true, fullName: true, isSuperAdmin: true, status: true, emailVerifiedAt: true },
  });
  if (!user || user.status !== "active" || !user.emailVerifiedAt) return next(unauthorized());
  req.user = { id: user.id, email: user.email, fullName: user.fullName, isSuperAdmin: user.isSuperAdmin };
  next();
};

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user?.isSuperAdmin) return next(forbidden());
  next();
};

/**
 * Tenant guard for /orgs/:orgId/... routes. Confirms membership (super admins pass),
 * blocks suspended organizations, and optionally restricts by role.
 */
export function requireOrg(roles?: Role[]): RequestHandler {
  return async (req, _res, next) => {
    const orgId = String(req.params.orgId);
    if (!/^[0-9a-f-]{36}$/i.test(orgId ?? "")) return next(forbidden());
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, status: true, currency: true, memberships: { where: { userId: req.user!.id }, select: { role: true } } },
    });
    const row = org && { id: org.id, status: org.status, currency: org.currency, role: org.memberships[0]?.role as Role | undefined };
    if (!row) return next(forbidden());
    const isSuper = req.user!.isSuperAdmin;
    if (!row.role && !isSuper) return next(forbidden());
    if (row.status !== "active" && !isSuper) return next(forbidden("This organization is suspended."));
    if (roles && !isSuper && !roles.includes(row.role!)) return next(forbidden());
    req.org = { id: row.id, role: row.role ?? "super_admin", currency: row.currency };
    next();
  };
}
