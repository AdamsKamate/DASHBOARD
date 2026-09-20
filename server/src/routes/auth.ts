import { Router, Request, Response } from "express";
import crypto from "crypto";
import { createUser, verifyUserByToken } from "../db/repositories/users";
import { hashPassword } from "../lib/password";
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

  // --- Validation ---
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
    // --- Hashing ---
    // The plaintext password never leaves this function: only the hash
    // is passed to the repository and then stored in the database.
    const passwordHash = await hashPassword(password);
    const verificationToken = generateVerificationToken();

    const user = await createUser({
      email: normalizedEmail,
      passwordHash,
      verificationToken,
    });

    // --- Confirmation email ---
    // Delivery failure does not cancel the registration: the account already
    // exists in the database. The user can request a new email later rather
    // than losing their account because the SMTP server was unreachable.
    const sent = await sendVerificationEmail(user.email, verificationToken);

    if (!sent) {
      if (isMailerConfigured()) {
        console.error(
          `[auth] could not send verification email to ${user.email}`
        );
      } else {
        // No SMTP server configured: fall back to the logs so the flow stays
        // testable. This path must never be reachable in production.
        const serverUrl = process.env.SERVER_URL ?? "http://localhost:8080";
        console.warn(
          `[auth] SMTP not configured, verification link for ${user.email}: ` +
            `${serverUrl}/auth/verify?token=${verificationToken}`
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

 The repository clears the token during the update, so a link works only once.
 A second attempt therefore matches no row and returns 400, which also covers
 unknown and already-used tokens with the same response.
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

export default router;
