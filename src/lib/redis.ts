import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

/**
 * Shared Upstash Redis client for Vercel Marketplace / Upstash integration.
 *
 * Env resolution (first match wins):
 * 1. UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (Upstash / Redis.fromEnv)
 * 2. KV_REST_API_URL + KV_REST_API_TOKEN                (legacy Vercel KV rename)
 *
 * Returns null when neither pair is set (local dev without Redis).
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    try {
      // Prefer fromEnv when standard names exist (official Vercel + Upstash path).
      client = Redis.fromEnv();
      return client;
    } catch (error) {
      console.error("[redis] Redis.fromEnv() failed, trying explicit config:", error);
      client = new Redis({ url: upstashUrl, token: upstashToken });
      return client;
    }
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    client = new Redis({ url: kvUrl, token: kvToken });
    return client;
  }

  client = null;
  return client;
}
