import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

const SALT_BYTE_LENGTH = 16;
const KEY_BYTE_LENGTH = 64;
const SCRYPT_PREFIX = 'scrypt$v1';

/**
 * Hashes a plaintext password using Node.js crypto.scrypt with a cryptographically
 * secure random salt (16 bytes) and 64-byte key length.
 *
 * Stored representation format: `scrypt$v1$<salt_hex>$<derived_key_hex>`
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  const salt = crypto.randomBytes(SALT_BYTE_LENGTH);
  const derivedKey = (await scryptAsync(password, salt, KEY_BYTE_LENGTH)) as Buffer;

  return `${SCRYPT_PREFIX}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash using constant-time comparison.
 * Never throws on malformed hashes; returns false instead.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== 'v1') {
    return false;
  }

  const saltHex = parts[2];
  const storedKeyHex = parts[3];

  if (!saltHex || !storedKeyHex) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expectedKey = Buffer.from(storedKeyHex, 'hex');

    if (salt.length !== SALT_BYTE_LENGTH || expectedKey.length !== KEY_BYTE_LENGTH) {
      return false;
    }

    const derivedKey = (await scryptAsync(password, salt, KEY_BYTE_LENGTH)) as Buffer;

    if (derivedKey.length !== expectedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}

/**
 * Generates an opaque, high-entropy 256-bit random session token (64 hex characters).
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes the SHA-256 hash of a raw session token.
 * Only the hash is stored in the database, protecting against database compromise.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
