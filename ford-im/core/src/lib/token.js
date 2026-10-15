// Tokens firmados (HMAC-SHA256) para ligas de un solo propósito: KYC, firma, respuesta del banco.
// Formato: base64url(payload).base64url(firma). El campo `p` (propósito) evita reusar un token
// de un flujo en otro.
import crypto from 'node:crypto';
import { config } from '../config.js';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function hmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

export function signToken(purpose, data, ttlSeconds, secret = config.secret) {
  const iat = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ p: purpose, ...data, iat, exp: iat + ttlSeconds }));
  return `${body}.${b64(hmac(body, secret))}`;
}

export function verifyToken(token, purpose, secret = config.secret) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.p !== purpose) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
