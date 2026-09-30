import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  createUser,
  verifyUserByToken,
  findUserByEmail,
  findUserById,
  toPublicUser,
} from "../db/repositories/users";
import { hashPassword, verifyPassword } from "../lib/password";
import { signToken } from "../lib/jwt";
import { requireAuth } from "../middleware/auth";
import { sendVerificationEmail, isMailerConfigured } from "../lib/mailer";
import {
  validateEmail,
  validatePassword,
  normalizeEmail,
} from "../lib/validation";

const router = Router();

/*
 PostgreSQL error code for a unique constraint violation.
*/
const PG_UNIQUE_VIOLATION = "23505";

/*
 Bcrypt hash of a value nobody knows, used to keep the login timing constant
 when the email does not exist.
 */
const DUMMY_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/*
 Generates the confirmation token sent by email.
 randomBytes uses the system cryptographic random number generator.
 */
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/*
 POST /auth/register
 Creates an unverified account. According to the assignment (C3), the user must
 confirm their registration before accessing the platform. The account is
 created with is_verified = FALSE.
 Responses: 201 created, 400 invalid input, 409 email already in use.
 */
router.post("/auth/register", async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  // Validation
  const emailCheck = validateEmail(email);
  const passwordCheck = validatePassword(password);
  if (!emailCheck.valid || !passwordCheck.valid) {
    return res.status(400).json({
      error: "Invalid input",
      details: [...emailCheck.errors, ...passwordCheck.errors],
    });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    // Hashing
    // The plaintext password never leaves this function: only the hash
    // is passed to the repository and then stored in the database.
    const passwordHash = await hashPassword(password);
    const verificationToken = generateVerificationToken();
    const user = await createUser({
      email: normalizedEmail,
      passwordHash,
      verificationToken,
    });

    // Confirmation email
    const sent = await sendVerificationEmail(user.email, verificationToken);
    if (!sent) {
      if (isMailerConfigured()) {
        console.error(
          `[auth] could not send verification email to ${user.email}`
        );
      } else {
        // No SMTP server configured: fall back to the logs so the flow stays
        // testable. This path must never be reachable in production.
        // Same link as the email: it points at the front end, which owns the
        // confirmation screen.
        const clientUrl = process.env.CLIENT_URL ?? "http://localhost:8081";
        console.warn(
          `[auth] SMTP not configured, verification link for ${user.email}: ` +
            `${clientUrl}/verify?token=${verificationToken}`
        );
      }
    }

    // The response contains neither the token nor the account identifier: the
    // token is meaningful only in the email, and exposing it here would allow
    // an account to be confirmed without access to the mailbox.
    return res.status(201).json({
      message: "Account created, email confirmation required",
    });
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === PG_UNIQUE_VIOLATION) {
      return res.status(409).json({ error: "Email already in use" });
    }
    console.error("[auth] registration failed:", (err as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 GET /auth/verify?token=<verification_token>
 Confirms an account from the link received by email.
 Responses: 200 confirmed, 400 invalid or already used token.
 */
router.get("/auth/verify", async (req: Request, res: Response) => {
  const { token } = req.query;

  if (typeof token !== "string" || token.length === 0) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  try {
    const user = await verifyUserByToken(token);

    if (!user) {
      // Deliberately identical to the message above: distinguishing "unknown
      // token" from "already used token" would tell an attacker which tokens
      // existed.
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    console.log(`[auth] account confirmed: ${user.email}`);
    return res.status(200).json({ message: "Account confirmed" });
  } catch (err) {
    console.error("[auth] verification failed:", (err as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 Cookie options for the JWT.
 httpOnly: unreadable by page JavaScript
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, same as the token lifetime
};

/*
 POST /auth/login
 Verifies credentials, then that the account is confirmed (C3), then issues a
 JWT. The token is returned in the body and also set as a cookie, so both
 browser clients and command-line clients are covered.
 Responses: 200 with token, 401 invalid credentials, 403 unconfirmed account.
 */
router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await findUserByEmail(normalizeEmail(email));

    // The password is compared even when no user was found, against a dummy
    // hash, so that both branches take the same amount of time. Returning
    // early here would make "unknown email" measurably faster than "wrong
    // password", which leaks which addresses are registered.
    const passwordMatches = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, DUMMY_HASH);

    if (!user || !passwordMatches) {
      // Deliberately identical for both cases: never reveal whether the email
      // exists.
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // C3: an unconfirmed account cannot access the platform. This check comes
    // after the password check so that an attacker cannot use it to discover
    // which addresses are registered.
    if (!user.is_verified) {
      return res.status(403).json({ error: "Account not confirmed" });
    }
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie("token", token, COOKIE_OPTIONS);

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[auth] login failed:", (err as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 GET /auth/me
 Returns the current user. Protected by requireAuth.
 */
router.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.user!.userId);

    if (!user) {
      // Valid token, but the account no longer exists.
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const publicUser = toPublicUser(user);
    return res.status(200).json({
      id: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
    });
  } catch (err) {
    console.error("[auth] me failed:", (err as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 POST /auth/logout
 Clears the cookie.
 */
router.post("/auth/logout", (_req: Request, res: Response) => {
  const { maxAge, ...clearOptions } = COOKIE_OPTIONS;
  res.clearCookie("token", clearOptions);
  return res.status(204).send();
});

export default router;