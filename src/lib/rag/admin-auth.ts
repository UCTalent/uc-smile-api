import type { Request } from "express";

/**
 * Verifies the admin Authorization header against the configured secret key.
 *
 * Expects: `Authorization: Bearer <ADMIN_SECRET_KEY>`
 *
 * @param req - Express request object
 * @returns true if the authorization header matches the configured secret
 */
export function verifyAdminAuth(req: Request): boolean {
  const auth = req.headers.authorization;
  return auth === `Bearer ${process.env.ADMIN_SECRET_KEY}`;
}
