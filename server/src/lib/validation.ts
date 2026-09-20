// Input validation.
// The assignment requires validating all inputs ("validate all inputs").

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/*
 Minimum password length.
 */
const MIN_PASSWORD_LENGTH = 8;

/*
 Maximum password length.
 bcrypt silently ignores anything beyond 72 bytes.
 */
const MAX_PASSWORD_LENGTH = 72;

/*
 Intentionally permissive email address validation.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof email !== "string" || email.trim().length === 0) {
    errors.push("email is required");
    return { valid: false, errors };
  }

  const trimmed = email.trim();

  if (trimmed.length > 255) {
    errors.push("email must not exceed 255 characters");
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    errors.push("email format is invalid");
  }

  return { valid: errors.length === 0, errors };
}

export function validatePassword(password: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof password !== "string" || password.length === 0) {
    errors.push("password is required");
    return { valid: false, errors };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_LENGTH) {
    errors.push(`password must not exceed ${MAX_PASSWORD_LENGTH} bytes`);
  }

  return { valid: errors.length === 0, errors };
}

/*
 Normalizes an email address before storage and comparison.
 Without normalization, "User@Example.com" and "user@example.com"
 would create two separate accounts.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}