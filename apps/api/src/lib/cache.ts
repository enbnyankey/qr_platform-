import Redis from "ioredis";
import { config } from "../config";

/**
 * The resolver caches QR lookups under qr:<code>. When Redis is configured, the API
 * deletes the key on every change so new destinations apply immediately. Without Redis
 * the resolver uses a short in-memory TTL instead.
 */
const redis = config.redisUrl ? new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 }) : null;

export async function invalidateQr(code: string) {
  if (!redis) return;
  try {
    await redis.del(`qr:${code}`);
  } catch (err) {
    console.warn("cache invalidation failed", (err as Error).message);
  }
}

export async function closeCache() {
  await redis?.quit();
}
