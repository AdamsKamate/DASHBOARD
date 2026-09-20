import { query, queryOne } from "../index";

// All SQL queries targeting the users table belong here and nowhere else:
// routes call these functions without writing SQL directly.

export interface User {
  id: string;
  email: string;
  password_hash: string;
  is_verified: boolean;
  verification_token: string | null;
  role: "user" | "admin";
  created_at: Date;
}

/* Public view: never expose a hash or token to the client. */
export interface PublicUser {
  id: string;
  email: string;
  role: "user" | "admin";
  isVerified: boolean;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isVerified: user.is_verified,
    createdAt: user.created_at,
  };
}

/*
 The password must already be hashed by the caller (bcrypt): this repository
 handles data access, not cryptography.
 Raises PostgreSQL error 23505 if the email already exists; the route maps it to 409.
 */
export async function createUser(params: {
  email: string;
  passwordHash: string;
  verificationToken: string;
}): Promise<User> {
  const user = await queryOne<User>(
    `INSERT INTO users (email, password_hash, verification_token)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.email, params.passwordHash, params.verificationToken]
  );
  if (!user) throw new Error("User insertion returned no row");
  return user;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>("SELECT * FROM users WHERE email = $1", [email]);
}

export async function findUserById(id: string): Promise<User | null> {
  return queryOne<User>("SELECT * FROM users WHERE id = $1", [id]);
}

/*
 The token is cleared during the operation, so it can only be used once.
 Returns null if the token is unknown or has already been used.
 */
export async function verifyUserByToken(token: string): Promise<User | null> {
  return queryOne<User>(
    `UPDATE users
        SET is_verified = TRUE, verification_token = NULL
      WHERE verification_token = $1
      RETURNING *`,
    [token]
  );
}

/* Reserved for administrators (route /admin/users). */
export async function listUsers(): Promise<PublicUser[]> {
  const users = await query<User>("SELECT * FROM users ORDER BY created_at DESC");
  return users.map(toPublicUser);
}

export async function deleteUser(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM users WHERE id = $1 RETURNING id",
    [id]
  );
  return rows.length > 0;
}
