// Plan entitlements, shared by the API (limits, features) and the QR resolver (scan limits, lapse policy).
// Plain CommonJS so both apps can use it without a build step.

const DEFAULT_BILLING = { lapsePolicy: "lock_editing", trialDays: 14, trialPlan: "pro", provider: "test", reminderDays: 7 };

async function billingSettings(prisma) {
  const row = await prisma.platformSetting.findUnique({ where: { key: "platform" } });
  const v = (row && row.value) || {};
  return {
    lapsePolicy: v.lapsePolicy === "pause_extra_codes" ? "pause_extra_codes" : "lock_editing",
    trialDays: Number.isInteger(v.trialDays) ? v.trialDays : DEFAULT_BILLING.trialDays,
    trialPlan: typeof v.trialPlan === "string" ? v.trialPlan : DEFAULT_BILLING.trialPlan,
    provider: typeof v.billingProvider === "string" ? v.billingProvider : DEFAULT_BILLING.provider,
    reminderDays: DEFAULT_BILLING.reminderDays,
  };
}

function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

const DAY = 86_400_000;

/**
 * What an organization can do right now.
 * state: "trial" | "active" | "free" | "lapsed"
 *   - trial/active: the subscribed plan applies until trialEndsAt / currentPeriodEnd
 *   - lapsed: a trial or paid period ended; the Free plan's limits apply again
 */
async function getEntitlements(prisma, orgId, opts = {}) {
  const now = opts.now || new Date();
  const [sub, settings] = await Promise.all([
    prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } }),
    billingSettings(prisma),
  ]);
  const free = await prisma.plan.findUnique({ where: { code: "free" } });

  let plan = free;
  let state = "free";
  let endsAt = null;
  if (sub) {
    if (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt > now) {
      plan = sub.plan;
      state = "trial";
      endsAt = sub.trialEndsAt;
    } else if (sub.status === "active" && sub.planCode !== "free" && sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
      plan = sub.plan;
      state = "active";
      endsAt = sub.currentPeriodEnd;
    } else if (sub.planCode !== "free" && (sub.trialEndsAt || sub.currentPeriodEnd)) {
      state = "lapsed";
      endsAt = sub.currentPeriodEnd || sub.trialEndsAt;
    }
  }

  const limits = { maxQr: 0, maxMenus: 0, scansPerMonth: 0, analyticsDays: 365, ...(plan && plan.limits) };
  const features = { logo: false, svgDownload: false, locationAnalytics: false, removeBranding: false, ...(plan && plan.features) };

  const [qr, menus, scansThisMonth] = await Promise.all([
    prisma.qrCode.count({ where: { orgId } }),
    prisma.menu.count({ where: { orgId } }),
    prisma.scanEvent.count({ where: { orgId, scannedAt: { gte: startOfMonth(now) } } }),
  ]);
  const over = (used, max) => max > 0 && used > max;
  const atLimit = (used, max) => max > 0 && used >= max;

  return {
    planCode: plan ? plan.code : "free",
    planName: plan ? plan.name : "Free",
    subscribedPlanCode: sub ? sub.planCode : "free",
    state,
    endsAt,
    daysLeft: endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY)) : null,
    expiringSoon: (state === "trial" || state === "active") && endsAt ? endsAt.getTime() - now.getTime() < settings.reminderDays * DAY : false,
    interval: sub ? sub.interval : null,
    limits,
    features,
    usage: { qr, menus, scansThisMonth },
    atLimit: { qr: atLimit(qr, limits.maxQr), menus: atLimit(menus, limits.maxMenus), scans: atLimit(scansThisMonth, limits.scansPerMonth) },
    overLimit: { qr: over(qr, limits.maxQr), menus: over(menus, limits.maxMenus) },
    lapsePolicy: settings.lapsePolicy,
  };
}

/** Starts a business on the trial plan (or Free when trials are off). */
async function startSubscription(tx, prisma, orgId, now = new Date()) {
  const s = await billingSettings(prisma);
  const trialPlan = s.trialDays > 0 ? await tx.plan.findFirst({ where: { code: s.trialPlan, isActive: true } }) : null;
  if (trialPlan && trialPlan.code !== "free") {
    return tx.subscription.create({
      data: { orgId, planCode: trialPlan.code, status: "trialing", trialEndsAt: new Date(now.getTime() + s.trialDays * DAY) },
    });
  }
  return tx.subscription.create({ data: { orgId, planCode: "free", status: "active" } });
}

module.exports = { getEntitlements, billingSettings, startSubscription, startOfMonth };
