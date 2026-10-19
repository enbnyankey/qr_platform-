import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import express, { Response } from "express";
import Redis from "ioredis";
import UAParser from "ua-parser-js";
import { billing, ports, prisma } from "@qr/db";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config();

/**
 * QR resolver: the only thing a printed code ever points at (QR_BASE_URL/q/<code>).
 * Kept separate from the API so printed codes keep working during API deploys.
 * Reads from cache, enforces status, redirects, and logs the scan without blocking.
 */
const PORT = ports.resolver; // set in the root package.json ("ports")
const TTL = Number(process.env.RESOLVER_CACHE_TTL_SECONDS ?? 15);
const SALT = process.env.SCAN_IP_SALT ?? "dev-salt";
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 }) : null;

interface QrRecord {
  id: string;
  org_id: string;
  code: string;
  type: string;
  payload: Record<string, any>;
  target_url: string | null;
  status: string;
  expires_at: string | null;
  org_status: string;
  org_name: string;
  brand_color: string;
  created_at: string;
}

// ---------- cache (Redis when configured, otherwise in-process with short TTL) ----------
const memory = new Map<string, { at: number; value: QrRecord | null }>();

async function cacheGet(code: string): Promise<QrRecord | null | undefined> {
  if (redis) {
    try {
      const raw = await redis.get(`qr:${code}`);
      return raw === null ? undefined : (JSON.parse(raw) as QrRecord | null);
    } catch {
      return undefined; // cache down: fall through to the database
    }
  }
  const hit = memory.get(code);
  if (hit && Date.now() - hit.at < TTL * 1000) return hit.value;
  return undefined;
}

async function cacheSet(code: string, value: QrRecord | null) {
  if (redis) {
    try {
      await redis.set(`qr:${code}`, JSON.stringify(value), "EX", value ? 300 : 30);
    } catch { /* ignore */ }
    return;
  }
  if (memory.size > 10_000) memory.clear();
  memory.set(code, { at: Date.now(), value });
}

async function lookup(code: string): Promise<QrRecord | null> {
  const cached = await cacheGet(code);
  if (cached !== undefined) return cached;
  const q = await prisma.qrCode.findUnique({
    where: { code },
    select: {
      id: true, orgId: true, code: true, type: true, payload: true, targetUrl: true, status: true, expiresAt: true, createdAt: true,
      org: { select: { status: true, name: true, brandColor: true } },
    },
  });
  const record: QrRecord | null = q && {
    id: q.id, org_id: q.orgId, code: q.code, type: q.type, payload: q.payload as Record<string, any>, target_url: q.targetUrl,
    status: q.status, expires_at: q.expiresAt?.toISOString() ?? null, org_status: q.org.status, org_name: q.org.name, brand_color: q.org.brandColor,
    created_at: q.createdAt.toISOString(),
  };
  await cacheSet(code, record);
  return record;
}

// ---------- scan logging ----------
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|discordbot|curl|wget|headless/i;
type Outcome = "redirected" | "served" | "blocked_inactive" | "blocked_expired" | "blocked_suspended" | "blocked_plan";

// ---------- plan checks (only bite when an admin chose the "pause extra codes" policy) ----------
const PLAN_TTL = Number(process.env.RESOLVER_PLAN_CACHE_SECONDS ?? 60);
const planCache = new Map<string, { at: number; value: Awaited<ReturnType<typeof billing.getEntitlements>> }>();
async function entitlements(orgId: string) {
  const hit = planCache.get(orgId);
  if (hit && Date.now() - hit.at < PLAN_TTL * 1000) return hit.value;
  const value = await billing.getEntitlements(prisma, orgId);
  if (planCache.size > 5_000) planCache.clear();
  planCache.set(orgId, { at: Date.now(), value });
  return value;
}

/** Returns a reason when this code should be paused for plan reasons, otherwise null. */
async function planBlock(qr: QrRecord): Promise<"lapsed" | "scan_limit" | null> {
  const e = await entitlements(qr.org_id);
  if (e.lapsePolicy !== "pause_extra_codes") return null; // default policy: printed codes always keep working
  if (e.atLimit.scans) return "scan_limit";
  if (e.state === "lapsed" && e.limits.maxQr > 0) {
    // The oldest codes, up to the Free allowance, keep working; newer ones pause until renewal.
    const older = await prisma.qrCode.count({ where: { orgId: qr.org_id, createdAt: { lt: new Date(qr.created_at) } } });
    if (older >= e.limits.maxQr) return "lapsed";
  }
  return null;
}

function logScan(req: express.Request, qr: QrRecord, outcome: Outcome) {
  const ua = req.get("user-agent") ?? "";
  if (BOT.test(ua)) return; // link previews and crawlers aren't real scans
  const r = new UAParser(ua).getResult();
  const device = r.device.type === "mobile" || r.device.type === "tablet" ? r.device.type : "desktop";
  // Coarse location from the edge/CDN headers (Cloudflare or Vercel) when present. No GPS, no raw IPs.
  const header = (...names: string[]) => names.map((n) => req.get(n)).find(Boolean) ?? "";
  const country = header("cf-ipcountry", "x-vercel-ip-country").slice(0, 2).toUpperCase() || null;
  const region = decodeURIComponent(header("cf-region", "x-vercel-ip-country-region")).slice(0, 80) || null;
  const city = decodeURIComponent(header("cf-ipcity", "x-vercel-ip-city")).slice(0, 80) || null;
  const ipHash = crypto.createHash("sha256").update(`${SALT}:${req.ip}`).digest("hex").slice(0, 32);
  prisma.scanEvent
    .create({
      data: {
        qrId: qr.id, orgId: qr.org_id, outcome, deviceType: device, os: r.os.name ?? null, browser: r.browser.name ?? null,
        country, region, city, referer: req.get("referer")?.slice(0, 300) ?? null, ipHash,
      },
    })
    .catch((err: Error) => console.error("scan log failed:", err.message));
}

// ---------- pages ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(res: Response, status: number, title: string, body: string, accent = "#0d6b5c") {
  res
    .status(status)
    .set("Cache-Control", "no-store")
    .type("html")
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{color-scheme:light dark;--a:${accent}}
body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f5f7f6;color:#14201b;padding:24px}
@media (prefers-color-scheme:dark){body{background:#0f1513;color:#e3ebe8}.card{background:#17201d!important;border-color:#2c3a35!important}}
.card{max-width:420px;width:100%;background:#fff;border:1px solid #cfd8d4;border-top:4px solid var(--a);border-radius:8px;padding:28px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 8px;opacity:.8;white-space:pre-wrap;word-wrap:break-word}
</style></head><body><main class="card">${body}</main></body></html>`);
}

function vcard(p: Record<string, any>) {
  const line = (k: string, v?: string) => (v ? `${k}:${String(v).replace(/[\n,;]/g, (c) => (c === "\n" ? "\\n" : `\\${c}`))}\r\n` : "");
  return (
    "BEGIN:VCARD\r\nVERSION:3.0\r\n" +
    `N:${p.lastName ?? ""};${p.firstName ?? ""};;;\r\n` +
    line("FN", [p.firstName, p.lastName].filter(Boolean).join(" ")) +
    line("ORG", p.organization) + line("TITLE", p.title) + line("TEL;TYPE=CELL", p.phone) +
    line("EMAIL", p.email) + line("URL", p.website) + line("ADR;TYPE=WORK", p.address ? `;;${p.address};;;;` : undefined) +
    "END:VCARD\r\n"
  );
}

// ---------- app ----------
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, service: "resolver", cache: redis ? "redis" : "memory" });
});

app.get("/q/:code", async (req, res) => {
  const code = req.params.code;
  if (!/^[0-9A-Za-z]{4,16}$/.test(code)) return page(res, 404, "Code not found", `<h1>We couldn't find this code</h1><p>Check that you scanned the full code and try again.</p>`);
  let qr: QrRecord | null;
  try {
    qr = await lookup(code);
  } catch (err) {
    console.error("lookup failed:", (err as Error).message);
    return page(res, 503, "Try again shortly", `<h1>We're having trouble right now</h1><p>Please scan again in a moment.</p>`);
  }
  if (!qr) return page(res, 404, "Code not found", `<h1>We couldn't find this code</h1><p>It may have been removed by its owner.</p>`);

  const accent = qr.brand_color || "#0d6b5c";
  const org = esc(qr.org_name);
  if (qr.status === "suspended" || qr.org_status !== "active") {
    logScan(req, qr, "blocked_suspended");
    return page(res, 410, "Unavailable", `<h1>This code is unavailable</h1><p>It has been suspended. If you think this is a mistake, contact ${org}.</p>`, accent);
  }
  if (qr.status === "inactive") {
    logScan(req, qr, "blocked_inactive");
    return page(res, 410, "Not active", `<h1>This code isn't active right now</h1><p>${org} has paused it. Check back later.</p>`, accent);
  }
  if (qr.expires_at && new Date(qr.expires_at) <= new Date()) {
    logScan(req, qr, "blocked_expired");
    return page(res, 410, "Expired", `<h1>This code has expired</h1><p>The link from ${org} is no longer available.</p>`, accent);
  }

  let block: "lapsed" | "scan_limit" | null = null;
  try {
    block = await planBlock(qr);
  } catch (err) {
    console.error("plan check failed:", (err as Error).message); // fail open: never break printed codes on our errors
  }
  if (block) {
    logScan(req, qr, "blocked_plan");
    return page(res, 402, "Temporarily unavailable", `<h1>This code is temporarily unavailable</h1><p>${org} needs to ${block === "scan_limit" ? "upgrade their plan to allow more scans this month" : "renew their plan"} to reactivate it.</p>`, accent);
  }

  if (qr.type === "contact") {
    logScan(req, qr, "served");
    const name = [qr.payload.firstName, qr.payload.lastName].filter(Boolean).join("-").replace(/[^a-z0-9-]/gi, "") || "contact";
    res.set({ "Content-Type": "text/vcard; charset=utf-8", "Content-Disposition": `inline; filename="${name}.vcf"`, "Cache-Control": "no-store" });
    return void res.send(vcard(qr.payload));
  }
  if (qr.type === "text" || !qr.target_url) {
    logScan(req, qr, "served");
    return page(res, 200, qr.org_name, `<h1>${org}</h1><p>${esc(String(qr.payload.text ?? ""))}</p>`, accent);
  }

  logScan(req, qr, "redirected");
  // 302 + no-store: phones must not cache the destination, or dynamic updates wouldn't take effect.
  res.set("Cache-Control", "no-store").redirect(302, qr.target_url);
});

app.use((_req, res) => page(res, 404, "Not found", `<h1>Nothing here</h1><p>This address isn't a QR code link.</p>`));

if (require.main === module) {
  app.listen(PORT, () => console.log(`QR resolver listening on http://localhost:${PORT} (cache: ${redis ? "redis" : `memory, ${TTL}s`})`));
}

export { app, prisma };
