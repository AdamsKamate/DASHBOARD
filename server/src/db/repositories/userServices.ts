import { query, queryOne } from "../index";
import { encrypt, decrypt, encryptOptional, decryptOptional } from "../../lib/crypto";

// Link between a user and a third-party service (C6, C13).

/* A row as stored, with its tokens still encrypted. */
interface UserServiceRow {
  user_id: string;
  service_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  created_at: Date;
}

/* A subscription as the rest of the server uses it: tokens readable. */
export interface ServiceSubscription {
  userId: string;
  serviceId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface TokensToStore {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

function toSubscription(row: UserServiceRow): ServiceSubscription {
  return {
    userId: row.user_id,
    serviceId: row.service_id,
    accessToken: decrypt(row.access_token),
    refreshToken: decryptOptional(row.refresh_token),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/*
 Links a service to a user, or updates the link if it already exists.
 */
export async function linkService(
  userId: string,
  serviceId: string,
  tokens: TokensToStore
): Promise<void> {
  await query(
    `INSERT INTO user_services (user_id, service_id, access_token, refresh_token, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, service_id)
     DO UPDATE SET
       access_token  = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at    = EXCLUDED.expires_at`,
    [
      userId,
      serviceId,
      encrypt(tokens.accessToken),
      encryptOptional(tokens.refreshToken),
      tokens.expiresAt,
    ]
  );
}

/*
 Reads a subscription with its tokens decrypted.
 Used by the widgets when they call a provider's API.
 */
export async function findSubscription(
  userId: string,
  serviceId: string
): Promise<ServiceSubscription | null> {
  const row = await queryOne<UserServiceRow>(
    `SELECT user_id, service_id, access_token, refresh_token, expires_at, created_at
       FROM user_services
      WHERE user_id = $1 AND service_id = $2`,
    [userId, serviceId]
  );

  return row ? toSubscription(row) : null;
}

/*
 Lists the services a user has linked.
 */
export async function listLinkedServices(userId: string): Promise<string[]> {
  const rows = await query<{ service_id: string }>(
    `SELECT service_id FROM user_services WHERE user_id = $1 ORDER BY service_id`,
    [userId]
  );
  return rows.map((row) => row.service_id);
}

/** True when the user has linked this service. */
export async function isServiceLinked(userId: string, serviceId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM user_services WHERE user_id = $1 AND service_id = $2
     ) AS exists`,
    [userId, serviceId]
  );
  return row?.exists === true;
}

/*
 Unlinks a service: the row, and therefore the tokens, are deleted.
 */
export async function unlinkService(userId: string, serviceId: string): Promise<boolean> {
  const rows = await query<{ service_id: string }>(
    `DELETE FROM user_services
      WHERE user_id = $1 AND service_id = $2
      RETURNING service_id`,
    [userId, serviceId]
  );
  return rows.length > 0;
}

/*
  True when the token has expired, or expires within the next minute.
 */
export function isTokenExpired(subscription: ServiceSubscription): boolean {
  if (!subscription.expiresAt) {
    // No expiry, as GitHub does: the token stays valid until revoked.
    return false;
  }
  const oneMinuteFromNow = Date.now() + 60_000;
  return subscription.expiresAt.getTime() <= oneMinuteFromNow;
}