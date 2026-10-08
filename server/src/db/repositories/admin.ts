import { query, queryOne } from "../index";

// Administration queries.

export interface AdminUserRow {
  id: string;
  email: string;
  role: "user" | "admin";
  is_verified: boolean;
  created_at: Date;
  /* How many widgets this account has, so the list says who actually uses it */
  widget_count: number;
  /* How many third-party accounts are linked */
  linked_service_count: number;
}

export interface AdminUser {
  id: string;
  email: string;
  role: "user" | "admin";
  isVerified: boolean;
  createdAt: string;
  widgetCount: number;
  linkedServiceCount: number;
}

function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isVerified: row.is_verified,
    createdAt: row.created_at.toISOString(),
    // PostgreSQL returns COUNT() as a string, since a bigint does not always
    // fit in a JavaScript number
    widgetCount: Number(row.widget_count),
    linkedServiceCount: Number(row.linked_service_count),
  };
}

/*
 Every account, newest first
 */
export async function listAllUsers(): Promise<AdminUser[]> {
  const rows = await query<AdminUserRow>(
    `SELECT
       u.id,
       u.email,
       u.role,
       u.is_verified,
       u.created_at,
       (SELECT COUNT(*) FROM widget_instances w WHERE w.user_id = u.id) AS widget_count,
       (SELECT COUNT(*) FROM user_services s WHERE s.user_id = u.id) AS linked_service_count
     FROM users u
     ORDER BY u.created_at DESC`
  );

  return rows.map(toAdminUser);
}

/* One account, for the checks a route makes before acting on it */
export async function findUserForAdmin(userId: string): Promise<AdminUser | null> {
  const row = await queryOne<AdminUserRow>(
    `SELECT
       u.id, u.email, u.role, u.is_verified, u.created_at,
       (SELECT COUNT(*) FROM widget_instances w WHERE w.user_id = u.id) AS widget_count,
       (SELECT COUNT(*) FROM user_services s WHERE s.user_id = u.id) AS linked_service_count
     FROM users u
     WHERE u.id = $1`,
    [userId]
  );

  return row ? toAdminUser(row) : null;
}

/* How many administrators remain, used to refuse removing the last one */
export async function countAdmins(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`
  );
  return Number(row?.count ?? 0);
}

/* Promotes or demotes an account. Returns null when it no longer exists */
export async function updateUserRole(
  userId: string,
  role: "user" | "admin"
): Promise<AdminUser | null> {
  const updated = await queryOne<{ id: string }>(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING id`,
    [userId, role]
  );

  return updated ? findUserForAdmin(userId) : null;
}

/*
 Deletes an account
 */
export async function deleteUserAccount(userId: string): Promise<boolean> {
  const deleted = await queryOne<{ id: string }>(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [userId]
  );
  return deleted !== null;
}

/* The widget identifiers of an account, read before deleting it */
export async function listUserWidgetIds(userId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM widget_instances WHERE user_id = $1`,
    [userId]
  );
  return rows.map((row) => row.id);
}
