import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../errors/index.js';

const GCM_PREFIX = 'gcm$v1';
const IV_BYTE_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const KEY_BYTE_LENGTH = 32; // 256-bit AES key

/**
 * Resolves a 32-byte key Buffer from the configured key string/hex.
 */
function resolveKey(keyInput?: string): Buffer {
  const rawKey = keyInput || config.MFA_ENCRYPTION_KEY;
  if (!rawKey || typeof rawKey !== 'string') {
    if (config.NODE_ENV === 'production') {
      throw new Error('[Config Error] Fatal: MFA_ENCRYPTION_KEY must be configured in production to perform two-step verification operations.');
    }
    // Safe deterministic development fallback
    return crypto.createHash('sha256').update('development-fallback-mfa-encryption-key-32b!').digest();
  }

  // If provided as a 64-character hex string, parse as hex; otherwise hash to 32 bytes
  if (rawKey.length === 64 && /^[0-9a-f]+$/i.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  // Derive a uniform 32-byte key using SHA-256
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts a plaintext TOTP secret using AES-256-GCM authenticated encryption.
 * Output format: `gcm$v1$<ivHex>$<authTagHex>$<ciphertextHex>`
 */
export function encryptTotpSecret(plainSecret: string, keyInput?: string): string {
  if (!plainSecret || typeof plainSecret !== 'string') {
    throw new Error('Plaintext secret must be a non-empty string.');
  }

  const key = resolveKey(keyInput);
  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainSecret, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${GCM_PREFIX}$${iv.toString('hex')}$${authTag.toString('hex')}$${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret.
 * Verifies authenticity tag and constant-time integrity.
 */
export function decryptTotpSecret(storedCiphertext: string, keyInput?: string): string {
  if (!storedCiphertext || typeof storedCiphertext !== 'string') {
    throw new Error('Stored ciphertext must be a non-empty string.');
  }

  const parts = storedCiphertext.split('$');
  if (parts.length !== 5 || parts[0] !== 'gcm' || parts[1] !== 'v1') {
    throw new Error('Malformed or unsupported encrypted secret format.');
  }

  const ivHex = parts[2];
  const tagHex = parts[3];
  const cipherHex = parts[4];

  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error('Missing components in encrypted secret.');
  }

  const key = resolveKey(keyInput);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encryptedText = Buffer.from(cipherHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(encryptedText),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    throw new Error('Failed to decrypt TOTP secret. Authentication tag verification failed or key mismatch.');
  }
}

/**
 * Normalizes a recovery code (stripping spaces, dashes, and converting to uppercase)
 * and computes its SHA-256 hex digest for secure storage.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (normalized.length < 6) {
    throw new Error('Recovery code is too short.');
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generates an array of cryptographically secure random recovery codes
 * and their corresponding SHA-256 hashes.
 * Format: `XXXXX-XXXXX` (10 alphanumeric chars in 2 blocks of 5).
 */
export function generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  // Characters excluding visually ambiguous 0, O, 1, I, L
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

  for (let i = 0; i < count; i++) {
    const randomBytes = crypto.randomBytes(10);
    let codeStr = '';
    for (let b = 0; b < 10; b++) {
      codeStr += chars[randomBytes[b] % chars.length];
    }
    const formatted = `${codeStr.slice(0, 5)}-${codeStr.slice(5, 10)}`;
    plainCodes.push(formatted);
    hashedCodes.push(hashRecoveryCode(formatted));
  }

  return { plainCodes, hashedCodes };
}

export interface MfaChallengeTokenPayload {
  accountId: string;
  role: string;
}

/**
 * Issues a stateless, short-lived (5 minutes) JWT challenge token indicating that
 * password verification passed and MFA OTP is required before issuing a session cookie.
 */
export function generateMfaChallengeToken(payload: MfaChallengeTokenPayload): string {
  return jwt.sign(
    {
      sub: payload.accountId,
      role: payload.role,
      type: 'mfa_challenge',
      jti: crypto.randomUUID(),
    },
    config.JWT_SECRET,
    {
      expiresIn: '5m',
      issuer: 'animemanager-mfa',
    }
  );
}

/**
 * Verifies the validity, signature, and expiration of an MFA challenge token.
 */
export function verifyMfaChallengeToken(token: string): MfaChallengeTokenPayload {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('MFA challenge token is required');
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      issuer: 'animemanager-mfa',
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    if (!decoded || decoded.type !== 'mfa_challenge' || !decoded.sub || !decoded.role) {
      throw new UnauthorizedError('Invalid MFA challenge token claims');
    }

    return {
      accountId: decoded.sub,
      role: decoded.role as string,
    };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('MFA verification challenge has expired. Please sign in again.');
    }
    throw new UnauthorizedError('Invalid or expired MFA challenge token');
  }
}
