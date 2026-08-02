import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

/**
 * Shared Upstash Redis client. Returns null when env is missing (local/dev).
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    client = null;
    return client;
  }

  client = new Redis({ url, token });
  return client;
}
