import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let limiter: Ratelimit | undefined;

function getLimiter() {
  if (limiter) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") throw new Error("Distributed rate limiting is not configured.");
    return null;
  }
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    analytics: false,
    prefix: "prooflayer:api"
  });
  return limiter;
}

export async function enforceRateLimit(key: string) {
  const configured = getLimiter();
  if (!configured) return { success: true, limit: 20, remaining: 19, reset: Date.now() + 60_000 };
  return configured.limit(key);
}

export function requestIp(request: Request) {
  // Trust only the platform's explicit client IP header; do not trust arbitrary X-Forwarded-For.
  const platformIp = request.headers.get("x-real-ip")?.trim();
  return platformIp && platformIp.length <= 64 ? platformIp : "unknown";
}
