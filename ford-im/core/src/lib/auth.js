import { config } from '../config.js';
import { safeEqual } from './token.js';

function bearer(req) {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : req.get('x-api-key') || '';
}

export const requireN8n = (req, res, next) =>
  safeEqual(bearer(req), config.n8nApiKey) ? next() : res.status(401).json({ error: 'unauthorized' });

export const requireAdmin = (req, res, next) =>
  safeEqual(bearer(req), config.adminApiKey) ? next() : res.status(401).json({ error: 'unauthorized' });

export function requireKiosk(req, res, next) {
  const kioskId = req.get('x-kiosk-id') || req.query.kiosk;
  const key = req.get('x-kiosk-key') || req.query.key;
  const expected = config.kioskKeys[kioskId];
  if (!expected || !safeEqual(key, expected)) return res.status(401).json({ error: 'kiosk_unauthorized' });
  req.kioskId = kioskId;
  next();
}

// Limitador en memoria por IP (suficiente para un solo contenedor; usar Redis si se escala).
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const t = Date.now();
    const entry = hits.get(key);
    if (!entry || t - entry.start > windowMs) {
      hits.set(key, { start: t, n: 1 });
      if (hits.size > 10000) for (const [k, v] of hits) if (t - v.start > windowMs) hits.delete(k);
      return next();
    }
    if (++entry.n > max) return res.status(429).send('Too many requests');
    next();
  };
}
