import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../../config";
import { prisma } from "../../db";
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from "../../lib/auth";
import { badRequest, conflict, forbidden, unauthorized } from "../../lib/errors";
import { sendMail, sendSms } from "../../lib/mailer";
import { randomOtp, sha256 } from "../../lib/util";
import { getSettings } from "../admin/settings";

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 10_000 : 30, standardHeaders: true, legacyHeaders: false });
authRouter.use(["/register", "/login", "/verify", "/resend", "/forgot", "/reset"], limiter);

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

type Purpose = "verify_email" | "reset_password";

/** Issues a 6-digit code by email, and by SMS too when the user has a phone and SMS is configured. */
async function issueOtp(user: { id: string; email: string; phone: string | null }, purpose: Purpose) {
  const code = randomOtp();
  await prisma.otpCode.create({
    data: { userId: user.id, purpose, codeHash: sha256(code), expiresAt: new Date(Date.now() + config.otpTtlMinutes * 60_000) },
  });
  const subject = purpose === "verify_email" ? "Your verification code" : "Your password reset code";
  const line = purpose === "verify_email" ? "Use this code to verify your account:" : "Use this code to reset your password:";
  await sendMail(user.email, subject, `${line}\n\n    ${code}\n\nIt expires in ${config.otpTtlMinutes} minutes. If you didn't ask for this, ignore this email.`);
  if (user.phone) await sendSms(user.phone, `Your QR Platform code is ${code}. It expires in ${config.otpTtlMinutes} minutes.`);
}

/** Checks the latest unused code for this purpose; counts failed attempts. */
async function consumeOtp(userId: string, purpose: Purpose, code: string) {
  const row = await prisma.otpCode.findFirst({ where: { userId, purpose, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt < new Date()) throw badRequest("This code has expired. Request a new one.");
  if (row.attempts >= config.otpMaxAttempts) throw badRequest("Too many attempts. Request a new code.");
  if (row.codeHash !== sha256(code)) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw badRequest("That code is incorrect.");
  }
  await prisma.otpCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
}

authRouter.post("/register", async (req, res) => {
  const body = z
    .object({
      fullName: z.string().trim().min(2, "Enter your full name.").max(120),
      email,
      password,
      phone: z.string().trim().max(20).optional().transform((v) => v || null),
    })
    .parse(req.body);
  if (!(await getSettings()).signupsOpen) throw forbidden("New sign-ups are paused right now. Please try again later.");
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing?.emailVerifiedAt) throw conflict("An account with this email already exists. Sign in instead.");
  const passwordHash = await bcrypt.hash(body.password, 10);
  // Unverified account with the same email: let them restart registration with fresh details.
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { fullName: body.fullName, passwordHash, phone: body.phone } })
    : await prisma.user.create({ data: { email: body.email, fullName: body.fullName, passwordHash, phone: body.phone } });
  await issueOtp(user, "verify_email");
  res.status(201).json({ ok: true, email: body.email, next: "verify" });
});

authRouter.post("/verify", async (req, res) => {
  const body = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) throw badRequest("That code is incorrect.");
  if (!user.emailVerifiedAt) {
    await consumeOtp(user.id, "verify_email", body.code);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }
  setSessionCookie(res, signSession(user.id));
  res.json({ ok: true });
});

authRouter.post("/resend", async (req, res) => {
  const body = z.object({ email }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (user && !user.emailVerifiedAt) await issueOtp(user, "verify_email");
  res.json({ ok: true }); // same response either way, so emails can't be enumerated
});

authRouter.post("/login", async (req, res) => {
  const body = z.object({ email, password: z.string().min(1, "Enter your password.") }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) throw unauthorized("Email or password is incorrect.");
  if (user.status !== "active") throw unauthorized("This account is suspended. Contact support.");
  if (!user.emailVerifiedAt) {
    await issueOtp(user, "verify_email");
    res.status(403).json({ error: { code: "email_unverified", message: "Verify your email first. We've sent you a new code." } });
    return;
  }
  setSessionCookie(res, signSession(user.id));
  res.json({ ok: true });
});

authRouter.post("/forgot", async (req, res) => {
  const body = z.object({ email }).parse(req.body);
  const user = await prisma.user.findFirst({ where: { email: body.email, status: "active" } });
  if (user) await issueOtp(user, "reset_password");
  res.json({ ok: true });
});

authRouter.post("/reset", async (req, res) => {
  const body = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."), password }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) throw badRequest("That code is incorrect.");
  await consumeOtp(user.id, "reset_password", body.code);
  // Resetting also proves ownership of the inbox, so mark the email verified.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.password, 10), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.user!.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    user: req.user,
    organizations: memberships.map(({ org, role }) => ({
      id: org.id, name: org.name, slug: org.slug, brandColor: org.brandColor, logoUrl: org.logoUrl,
      currency: org.currency, status: org.status, role,
    })),
  });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const body = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest("Current password is incorrect.");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
  res.json({ ok: true });
});
