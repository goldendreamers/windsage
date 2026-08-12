import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(password), salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return {
    passwordSalt: salt.toString('base64'),
    passwordHash: Buffer.from(derived).toString('base64'),
  };
}

export async function verifyPassword(password, passwordHash, passwordSalt) {
  if (!passwordHash || !passwordSalt) return false;
  try {
    const salt = Buffer.from(passwordSalt, 'base64');
    const expected = Buffer.from(passwordHash, 'base64');
    const derived = await scrypt(String(password), salt, expected.length, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    return crypto.timingSafeEqual(Buffer.from(derived), expected);
  } catch {
    return false;
  }
}

export function parseBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

export function validateUsername(username) {
  const u = String(username || '').trim();
  if (u.length < 3 || u.length > 32) {
    return { ok: false, error: 'Username must be 3–32 characters' };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) {
    return { ok: false, error: 'Username: letters, numbers, . _ - only' };
  }
  return { ok: true, username: u };
}

export function validatePassword(password) {
  const p = String(password || '');
  if (p.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  if (p.length > 128) return { ok: false, error: 'Password too long' };
  return { ok: true, password: p };
}
