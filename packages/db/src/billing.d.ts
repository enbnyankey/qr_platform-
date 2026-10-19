import type { PrismaClient, Prisma, Subscription } from "@prisma/client";

export interface PlanLimits { maxQr: number; maxMenus: number; scansPerMonth: number; analyticsDays: number }
export interface PlanFeatures { logo: boolean; svgDownload: boolean; locationAnalytics: boolean; removeBranding: boolean }
export type LapsePolicy = "lock_editing" | "pause_extra_codes";

export interface Entitlements {
  planCode: string;
  planName: string;
  subscribedPlanCode: string;
  state: "trial" | "active" | "free" | "lapsed";
  endsAt: Date | null;
  daysLeft: number | null;
  expiringSoon: boolean;
  interval: "month" | "year" | null;
  limits: PlanLimits;
  features: PlanFeatures;
  usage: { qr: number; menus: number; scansThisMonth: number };
  atLimit: { qr: boolean; menus: boolean; scans: boolean };
  overLimit: { qr: boolean; menus: boolean };
  lapsePolicy: LapsePolicy;
}

export interface BillingSettings { lapsePolicy: LapsePolicy; trialDays: number; trialPlan: string; provider: string; reminderDays: number }

export declare function getEntitlements(prisma: PrismaClient, orgId: string, opts?: { now?: Date }): Promise<Entitlements>;
export declare function billingSettings(prisma: PrismaClient): Promise<BillingSettings>;
export declare function startSubscription(tx: Prisma.TransactionClient, prisma: PrismaClient, orgId: string, now?: Date): Promise<Subscription>;
export declare function startOfMonth(d?: Date): Date;
