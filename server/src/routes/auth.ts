import { Router, Request, Response } from "express";
import crypto from "crypto";
import { createUser } from "../db/repositories/users";
import { hashPassword } from "../lib/password";
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

    // Actual email delivery is covered in the next card. In the meantime, the
    // link is displayed in the server logs so the flow can be tested.
    const serverUrl = process.env.SERVER_URL ?? "http://localhost:8080";
    console.log(
      `[auth] verification link for ${user.email}: ` +
        `${serverUrl}/auth/verify?token=${verificationToken}`
    );

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

export default router;
