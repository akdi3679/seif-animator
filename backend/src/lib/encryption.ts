// backend/src/lib/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';


const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.PII_ENCRYPTION_KEY!, 'base64'); // 32 bytes base64

if (!process.env.PII_ENCRYPTION_KEY || KEY.length !== 32) {
  throw new Error('PII_ENCRYPTION_KEY must be a 32‑byte base64 string');
}

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encryptedData: string): string {
  const [ivB64, tagB64, dataB64] = encryptedData.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// Optional: Keep the buffer functions if needed for exports
export function encryptBuffer(buffer: Buffer): Buffer {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
} 

export function decryptBuffer(encryptedBuffer: Buffer): Buffer {
  const iv = encryptedBuffer.subarray(0, 16);
  const authTag = encryptedBuffer.subarray(16, 32);
  const encrypted = encryptedBuffer.subarray(32);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}