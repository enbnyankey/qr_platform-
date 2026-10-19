import { billing, prisma } from "@qr/db";
import type { Entitlements } from "@qr/db/src/billing";
import { upgradeRequired } from "../../lib/errors";

export type { Entitlements };

export const entitlementsFor = (orgId: string) => billing.getEntitlements(prisma, orgId);

const FEATURE_LABEL: Record<string, string> = {
  logo: "Adding a logo to your QR code",
  svgDownload: "SVG downloads",
  locationAnalytics: "Location analytics",
  removeBranding: "Removing platform branding",
};

/** Throws 402 when the business's current plan doesn't include a feature. */
export async function requireFeature(orgId: string, feature: keyof Entitlements["features"]) {
  const e = await entitlementsFor(orgId);
  if (!e.features[feature]) {
    throw upgradeRequired(`${FEATURE_LABEL[feature] ?? "This feature"} isn't included in the ${e.planName} plan. Upgrade to use it.`, { reason: "feature", feature });
  }
  return e;
}

/** Throws 402 when creating one more QR code or menu would go over the plan's limit. */
export async function assertCanCreate(orgId: string, what: "qr" | "menus") {
  const e = await entitlementsFor(orgId);
  const limit = what === "qr" ? e.limits.maxQr : e.limits.maxMenus;
  const used = what === "qr" ? e.usage.qr : e.usage.menus;
  if (limit > 0 && used >= limit) {
    const noun = what === "qr" ? "QR codes" : "menus";
    const lapsed = e.state === "lapsed" ? " Your plan has ended, so the Free plan limits apply." : "";
    throw upgradeRequired(`The ${e.planName} plan includes ${limit} ${noun} and you've used them all.${lapsed} Upgrade to create more.`, {
      reason: `${what}_limit`,
      limit,
    });
  }
  return e;
}

/**
 * When a paid plan or trial has ended and the business is over the Free limits, editing is
 * locked (lock_editing policy) until they renew. Pausing or deleting codes is still allowed.
 */
export async function assertCanEdit(orgId: string) {
  const e = await entitlementsFor(orgId);
  if (e.state === "lapsed" && (e.overLimit.qr || e.overLimit.menus)) {
    throw upgradeRequired("Your plan has ended and this business is over the Free plan limits. Renew to keep editing.", { reason: "lapsed" });
  }
  return e;
}
