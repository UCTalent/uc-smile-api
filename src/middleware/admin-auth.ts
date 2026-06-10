import type { NextFunction, Request, Response } from "express";
import { verifyAdminAuth } from "../lib/rag/admin-auth";

/**
 * Express middleware that enforces admin authentication.
 *
 * Expects: `Authorization: Bearer <ADMIN_SECRET_KEY>`
 * Returns 401 if the header is missing or does not match.
 */
export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!verifyAdminAuth(req)) {
    res.status(401).json({ error: "Unauthorized. Valid Bearer token required." });
    return;
  }
  next();
}
