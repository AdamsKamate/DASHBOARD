import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt";

// Protect private routes.

/*
 Without this declaration, TypeScript would reject `req.user`.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/*
 Extracts the token from the request.
 */
function extractToken(req: Request): string | null {
  const cookieToken = (req as Request & { cookies?: Record<string, string> })
    .cookies?.token;
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  return null;
}

/*
 Requires a valid token.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = verifyToken(token);

  if (!payload) {
    // Expired and forged tokens return the same message.
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = payload;
  next();
}

/*
 Requires the administrator role.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.role !== "admin") {
    // 403 instead of 401: the user is identified but does not have permission.
    // Returning 401 would suggest logging in again, which would not help.
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  next();
}

/*
 Reads the token if present without requiring it.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) req.user = payload;
  }
  next();
}