// Bitácora de mensajes de WhatsApp para la bandeja del vendedor.
import { getDb, now } from '../db.js';

const sessionFor = (waId) =>
  getDb().prepare('SELECT id FROM sessions WHERE wa_id = ? ORDER BY updated_at DESC LIMIT 1').get(String(waId))?.id ?? null;

export function logMessage({ sessionId = null, waId, direction, author, type = 'text', body = '' }) {
  const sid = sessionId ?? sessionFor(waId);
  const t = now();
  getDb().prepare('INSERT INTO messages (session_id, wa_id, direction, author, type, body, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(sid, String(waId), direction, author, type, String(body ?? '').slice(0, 4000), t);
  if (sid && direction === 'in') getDb().prepare('UPDATE sessions SET last_inbound_at = ? WHERE id = ?').run(t, sid);
}

export const listMessages = (sessionId, afterId = 0) =>
  getDb().prepare('SELECT id, direction, author, type, body, created_at FROM messages WHERE session_id = ? AND id > ? ORDER BY id').all(sessionId, afterId);
