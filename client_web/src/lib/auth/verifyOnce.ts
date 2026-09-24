import { api } from "../api";

// Account confirmation, called at most once per token.
const verificationByToken = new Map<string, Promise<void>>();

export function verifyAccountOnce(token: string): Promise<void> {
  const alreadyStarted = verificationByToken.get(token);
  if (alreadyStarted) {
    return alreadyStarted;
  }

  const verification = api.auth.verify(token).then(() => undefined);
  verificationByToken.set(token, verification);
  return verification;
}

/* Clears the cache. Used by tests only. */
export function resetVerificationCache(): void {
  verificationByToken.clear();
}