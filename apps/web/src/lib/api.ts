/** Thin client for the Express API, reached through the /api rewrite. */
import { toast } from "sonner";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string[]>) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    const type = res.headers.get("content-type") ?? "";
    return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  const e = body?.error;
  // Plan limits: let the app shell show the upgrade dialog wherever this happened.
  if (res.status === 402 && e?.code === "upgrade_required" && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("qr:upgrade", { detail: { message: e.message } }));
  }
  throw new ApiError(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status}).`, e?.fields);
}

/**
 * Success messages for changes, by method and path. Anything not listed (and every
 * read) stays quiet. Failures always show a toast unless the caller opts out.
 */
const SUCCESS: [string, RegExp, string][] = [
  ["POST", /^\/orgs$/, "Business created"],
  ["PATCH", /^\/orgs\/[^/]+$/, "Business settings saved"],
  ["POST", /^\/auth\/change-password$/, "Password changed"],
  ["POST", /^\/orgs\/[^/]+\/qr$/, "QR code created"],
  ["PATCH", /^\/orgs\/[^/]+\/qr\/[^/]+$/, "QR code updated"],
  ["DELETE", /^\/orgs\/[^/]+\/qr\/[^/]+$/, "QR code deleted"],
  ["POST", /^\/orgs\/[^/]+\/menus$/, "Menu created"],
  ["PATCH", /^\/orgs\/[^/]+\/menus\/[^/]+$/, "Menu saved"],
  ["DELETE", /^\/orgs\/[^/]+\/menus\/[^/]+$/, "Menu deleted"],
  ["POST", /\/menus\/[^/]+\/sections$/, "Section added"],
  ["PATCH", /\/menus\/[^/]+\/sections\/[^/]+$/, "Section updated"],
  ["DELETE", /\/menus\/[^/]+\/sections\/[^/]+$/, "Section removed"],
  ["POST", /\/sections\/[^/]+\/items$/, "Item added"],
  ["PATCH", /\/menus\/[^/]+\/items\/[^/]+$/, "Item updated"],
  ["DELETE", /\/menus\/[^/]+\/items\/[^/]+$/, "Item removed"],
  ["POST", /^\/orgs\/[^/]+\/uploads$/, "File uploaded"],
  ["POST", /^\/orgs\/[^/]+\/events$/, "Event created"],
  ["DELETE", /^\/orgs\/[^/]+\/events\/[^/]+$/, "Event deleted"],
  ["POST", /^\/orgs\/[^/]+\/events\/[^/]+\/qr$/, "QR code created"],
  ["PUT", /^\/admin\/settings$/, "Platform settings saved"],
  ["PUT", /^\/admin\/plans\/[^/]+$/, "Plan saved"],
  ["POST", /^\/admin\/organizations\/[^/]+\/subscription$/, "Plan given"],
  ["PATCH", /^\/admin\/users\/[^/]+$/, "User updated"],
  ["PATCH", /^\/admin\/organizations\/[^/]+$/, "Business updated"],
  ["PATCH", /^\/admin\/qr-codes\/[^/]+$/, "QR code updated"],
];

function successMessage(method: string, path: string) {
  const clean = path.split("?")[0];
  return SUCCESS.find(([m, re]) => m === method && re.test(clean))?.[2] ?? null;
}

/** Sign-in pages and the help chat show their own errors; plan limits open the upgrade dialog. */
function toastsError(path: string, err: unknown) {
  if (err instanceof ApiError && err.status === 402) return false;
  if (path.startsWith("/auth/") && !path.startsWith("/auth/change-password")) return false;
  return !path.startsWith("/help") && !path.startsWith("/public/");
}

export async function api<T = any>(
  path: string,
  init: RequestInit & { json?: unknown; /** a custom success message, or false for no toasts at all */ toast?: string | false } = {},
): Promise<T> {
  const { json, headers, toast: toastOpt, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  const isChange = method !== "GET" && method !== "HEAD";
  try {
    const res = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const out = await handle<T>(res);
    if (isChange && toastOpt !== false && typeof window !== "undefined") {
      const msg = toastOpt ?? successMessage(method, path);
      if (msg) toast.success(msg);
    }
    return out;
  } catch (err) {
    if (isChange && toastOpt !== false && typeof window !== "undefined" && toastsError(path, err)) {
      const message = err instanceof ApiError ? err.message : "Couldn't reach the server. Check your connection and try again.";
      toast.error(message);
    }
    throw err;
  }
}

export const fetcher = (path: string) => api(path);

export async function uploadFile(orgId: string, file: File): Promise<{ path: string }> {
  const form = new FormData();
  form.append("file", file);
  return api(`/orgs/${orgId}/uploads`, { method: "POST", body: form });
}

/** API upload paths (/uploads/...) are served through the proxy at /api/uploads/... */
export function assetUrl(path?: string | null) {
  if (!path) return undefined;
  return path.startsWith("/uploads/") ? `/api${path}` : path;
}

export function formatMoney(minor: number, currency = "GHS") {
  try {
    return new Intl.NumberFormat("en-GH", { style: "currency", currency, minimumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export function relativeTime(iso?: string | null) {
  if (!iso) return "Never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
