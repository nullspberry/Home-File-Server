import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { config } from './config';
import { HttpError } from './errors';

// Generates an HMAC-signed token: <timestamp>.<signature>
export function generateSignedToken(): string {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(timestamp)
    .digest('hex');
  return `${timestamp}.${signature}`;
}

export function loginAdmin(username: string, pass: string): string {
  const validUser = config.adminUsername;
  const validPass = config.adminPassword;

  const userBuf = Buffer.from(username || '');
  const expectedUserBuf = Buffer.from(validUser);
  const passBuf = Buffer.from(pass || '');
  const expectedPassBuf = Buffer.from(validPass);

  const userMatch =
    userBuf.length === expectedUserBuf.length &&
    crypto.timingSafeEqual(userBuf, expectedUserBuf);
  const passMatch =
    passBuf.length === expectedPassBuf.length &&
    crypto.timingSafeEqual(passBuf, expectedPassBuf);

  if (!userMatch || !passMatch) {
    throw new HttpError(401, 'Invalid username or password');
  }

  return generateSignedToken();
}

export function logoutAdmin(): void {
  // Stateless tokens are invalidated on client by clearing cookie and localStorage
}

export function verifyAdminToken(token?: string | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestampStr, signature] = parts;
  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp)) return false;

  // Max age: 7 days
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - timestamp > MAX_AGE_MS || timestamp > Date.now() + 60000) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(timestampStr)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function getAuthTokenFromRequest(req: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // 2. Next.js cookies() helper
  try {
    const cookieStore = cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (token) return token;
  } catch {}

  // 3. Raw Cookie header fallback
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const match = /(?:^|;\s*)admin_token=([^;]+)/.exec(cookieHeader);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

export function requireAdmin(req: Request): string {
  const token = getAuthTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    throw new HttpError(401, 'Admin authorization required');
  }
  return token!;
}
