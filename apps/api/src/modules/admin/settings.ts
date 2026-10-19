import { z } from "zod";
import { prisma } from "../../db";
import { QR_TYPES, QrType } from "../qr/destinations";

/** Platform configuration managed by Super Admins in the admin console. */
export const settingsSchema = z.object({
  signupsOpen: z.boolean().default(true),
  allowedQrTypes: z.array(z.enum(QR_TYPES as [QrType])).min(1, "Allow at least one QR type.").default([...QR_TYPES]),
  maxQrPerOrg: z.number().int().min(0).max(100_000).default(0), // 0 = unlimited
  maxMenusPerOrg: z.number().int().min(0).max(10_000).default(0),
  announcement: z.string().trim().max(280).default(""), // shown as a banner in the dashboard
  supportEmail: z.string().trim().email().or(z.literal("")).default(""),
  // Billing
  billingProvider: z.enum(["test", "paystack", "hubtel"]).default("test"),
  trialDays: z.number().int().min(0).max(90).default(14), // 0 = no trial
  trialPlan: z.string().trim().min(1).default("pro"),
  lapsePolicy: z.enum(["lock_editing", "pause_extra_codes"]).default("lock_editing"),
});
export type PlatformSettings = z.infer<typeof settingsSchema>;

const KEY = "platform";
let cache: { at: number; value: PlatformSettings } | null = null;

export async function getSettings(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
  const value = settingsSchema.parse(row?.value ?? {});
  cache = { at: Date.now(), value };
  return value;
}

/** Saves a full or partial update; fields not sent keep their current value. */
export async function saveSettings(input: unknown, userId: string) {
  const current = await getSettings();
  const value = settingsSchema.parse({ ...current, ...(input && typeof input === "object" ? input : {}) });
  await prisma.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedById: userId },
    update: { value, updatedById: userId },
  });
  cache = { at: Date.now(), value };
  return value;
}

/** For tests: forget the cached copy. */
export function clearSettingsCache() {
  cache = null;
}
