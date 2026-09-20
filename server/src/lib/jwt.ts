import jwt, { SignOptions } from "jsonwebtoken";

// JSON Web Tokens.

const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error(
    "JWT_SECRET is missing. Generate a value with: openssl rand -hex 32"
  );
}

// Freeze the constant here.
const JWT_SECRET: string = secret;

/*
 Token validity period.
 */
const EXPIRES_IN: SignOptions["expiresIn"] = "7d";

/*
 Token contents.
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: "user" | "admin";
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: EXPIRES_IN,
    // HS256: symmetric signature; the same key signs and verifies the token.
    // This is sufficient because only our server issues and validates tokens.
    algorithm: "HS256",
  });
}

/*
 Verifies a token's signature and expiration.
 Returns null if the token is invalid, expired, or malformed.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload;
  } catch {
    return null;
  }
}
