import type { NextFunction, Request, Response } from "express";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

const MAX_REQUESTS = 20;
const WINDOW_MS = 60_000; // 1 minute

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * In-memory rate limiter middleware: 20 requests per IP per minute.
 *
 * Uses a sliding window approach — counters reset after 1 minute from the
 * first request in the window.
 *
 * Returns 429 with an error message when the limit is exceeded.
 */
export function rateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ip = getClientIp(req);
  const now = Date.now();

  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    // First request or window has expired
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= MAX_REQUESTS) {
    res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    return;
  }

  entry.count += 1;
  next();
}
