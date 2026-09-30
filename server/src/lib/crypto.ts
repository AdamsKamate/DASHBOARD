import crypto from "crypto";

// Encrypting the OAuth tokens (C13).
// AES-256-GCM is used: it encrypts AND authenticates. 

const ALGORITHM = "aes-256-gcm";

/*
 Length of the initialisation vector, in bytes : 12 bytes
 */
const INITIALISATION_VECTOR_LENGTH = 12;

/* Length of the authentication tag GCM produces, in bytes. */
const AUTHENTICATION_TAG_LENGTH = 16;

/* Separates the three parts of a stored value. */
const PART_SEPARATOR = ":";

/*
 Reads the key from the environment, once.
 ENCRYPTION_KEY holds 32 bytes in base64, generated with:
 openssl rand -base64 32
 */
let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error(
      "ENCRYPTION_KEY is missing. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}. ` +
        `Generate a valid one with: openssl rand -base64 32`
    );
  }
  cachedKey = key;
  return key;
}

/*
 Encrypts a value. Returns "iv:tag:ciphertext", all three in base64.
 */
export function encrypt(plainText: string): string {
  const key = getEncryptionKey();
  const initialisationVector = crypto.randomBytes(INITIALISATION_VECTOR_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, initialisationVector);
  const cipherText = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  // The tag is produced by final(): it authenticates the ciphertext, and
  // decryption refuses to proceed without it.
  const authenticationTag = cipher.getAuthTag();
  return [
    initialisationVector.toString("base64"),
    authenticationTag.toString("base64"),
    cipherText.toString("base64"),
  ].join(PART_SEPARATOR);
}

/*
 Decrypts a value produced by encrypt().
 */
export function decrypt(storedValue: string): string {
  const key = getEncryptionKey();
  const parts = storedValue.split(PART_SEPARATOR);
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value: expected iv:tag:ciphertext");
  }
  const [encodedVector, encodedTag, encodedCipherText] = parts;
  const initialisationVector = Buffer.from(encodedVector, "base64");
  const authenticationTag = Buffer.from(encodedTag, "base64");
  const cipherText = Buffer.from(encodedCipherText, "base64");

  if (initialisationVector.length !== INITIALISATION_VECTOR_LENGTH) {
    throw new Error("Malformed encrypted value: wrong initialisation vector length");
  }
  if (authenticationTag.length !== AUTHENTICATION_TAG_LENGTH) {
    throw new Error("Malformed encrypted value: wrong authentication tag length");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, initialisationVector);
  decipher.setAuthTag(authenticationTag);

  // final() is what verifies the tag: it throws when the ciphertext or the
  // tag has been altered, so a tampered row never decrypts silently.
  return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
}

/*
 Encrypts a value that may be absent.
 */
export function encryptOptional(plainText: string | null): string | null {
  return plainText === null ? null : encrypt(plainText);
}

/* Decrypts a value that may be absent. */
export function decryptOptional(storedValue: string | null): string | null {
  return storedValue === null ? null : decrypt(storedValue);
}