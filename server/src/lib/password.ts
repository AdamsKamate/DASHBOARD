import bcrypt from "bcrypt";

// Password hashing.

/*
 Hashing cost (number of rounds = 2^SALT_ROUNDS).
 10 is a common compromise: approximately 60 ms per hash on an ordinary
 machine. Slow enough to make brute-force attacks expensive.
 */
const SALT_ROUNDS = 10;

/*
 Hashes a plaintext password.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/*
 Compares a plaintext password with the hash stored in the database.
 */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
