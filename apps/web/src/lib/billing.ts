"use client";

import useSWR from "swr";
import { fetcher } from "./api";

export interface Entitlements {
  planCode: string;
  planName: string;
  subscribedPlanCode: string;
  state: "trial" | "active" | "free" | "lapsed";
  endsAt: string | null;
  daysLeft: number | null;
  expiringSoon: boolean;
  interval: "month" | "year" | null;
  limits: { maxQr: number; maxMenus: number; scansPerMonth: number; analyticsDays: number };
  features: { logo: boolean; svgDownload: boolean; locationAnalytics: boolean; removeBranding: boolean };
  usage: { qr: number; menus: number; scansThisMonth: number };
  atLimit: { qr: boolean; menus: boolean; scans: boolean };
  overLimit: { qr: boolean; menus: boolean };
  lapsePolicy: "lock_editing" | "pause_extra_codes";
}

export interface Plan {
  code: string;
  name: string;
  description: string | null;
  currency: string;
  priceMonthlyMinor: number;
  priceYearlyMinor: number;
  limits: Entitlements["limits"];
  features: Entitlements["features"];
  isActive: boolean;
}

export interface BillingInfo {
  entitlements: Entitlements;
  plans: Plan[];
  payments: any[];
  provider: { name: string; label: string; ready: boolean } | null;
}

export function useBilling(orgId: string) {
  return useSWR<BillingInfo>(`/orgs/${orgId}/billing`, fetcher, { revalidateOnFocus: true });
}

/** Ask the app shell to show the upgrade dialog (e.g. after a 402 from the API). */
export function promptUpgrade(message: string) {
  window.dispatchEvent(new CustomEvent("qr:upgrade", { detail: { message } }));
}

export const FEATURE_LABELS: Record<keyof Entitlements["features"], string> = {
  logo: "Logo in the centre of codes",
  svgDownload: "SVG downloads for print",
  locationAnalytics: "Country and city in scan stats",
  removeBranding: "No platform branding on your pages",
};

export const limitText = (n: number, plural: string, singular = plural.replace(/s$/, "")) =>
  n === 0 ? `Unlimited ${plural}` : `${n.toLocaleString()} ${n === 1 ? singular : plural}`;

/** Whole months saved by paying yearly, e.g. 2 when yearly = 10 × monthly. */
export function monthsFreeYearly(p: { priceMonthlyMinor: number; priceYearlyMinor: number }) {
  if (!p.priceMonthlyMinor || !p.priceYearlyMinor) return 0;
  return Math.max(0, Math.round((12 * p.priceMonthlyMinor - p.priceYearlyMinor) / p.priceMonthlyMinor));
}
