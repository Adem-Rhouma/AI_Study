import crypto from 'node:crypto';
import { config } from '../config.js';

const ALGO = 'aes-256-gcm';

/** Encrypts a secret for storage in ai_providers. Returns base64 of iv|tag|ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, config.secret, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length < 28) throw new Error('stored secret is malformed');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, config.secret, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Last-4 style hint so admins can recognise a stored key without reading it. */
export function secretHint(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return tail.length === 0 ? '' : `••••${tail}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Sessions and reset tokens are stored hashed so a database read cannot replay them. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}
