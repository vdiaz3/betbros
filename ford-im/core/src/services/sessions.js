// Sesión = un lead que escaneó el QR. Se crea al escanear (con un código ref corto que viaja
// en el mensaje pre-llenado de WhatsApp) y se "reclama" cuando llega el primer mensaje.
import { getDb, now, uid, shortCode, logEvent } from '../db.js';
import { config } from '../config.js';
import { normLang } from '../lib/i18n.js';

const db = () => getDb();

export const STAGES = [
  'scanned', 'chatting', 'credit_consent', 'kyc', 'credit_collecting',
  'signing', 'sent_to_bank', 'bank_approved', 'bank_rejected', 'bank_more_info', 'closed',
];

export function createSessionFromQr(qrRow) {
  const t = now();
  const id = uid('ses_');
  let ref;
  for (let i = 0; i < 5; i++) {
    ref = shortCode(6);
    if (!db().prepare('SELECT 1 FROM sessions WHERE ref = ?').get(ref)) break;
  }
  db()
    .prepare(
      `INSERT INTO sessions (id, ref, qr_token, kiosk_id, dealer_id, vehicle_id, lang, ref_expires_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, ref, qrRow.id, qrRow.kiosk_id, qrRow.dealer_id, qrRow.vehicle_id, qrRow.lang,
      t + config.qr.refTtlMinutes * 60_000, t, t);
  logEvent('qr_scanned', { sessionId: id, kioskId: qrRow.kiosk_id, data: { vehicle: qrRow.vehicle_id } });
  return getSession(id);
}

export const getSession = (id) => db().prepare('SELECT * FROM sessions WHERE id = ?').get(id) || null;

export function latestSessionForWa(waId) {
  return db().prepare('SELECT * FROM sessions WHERE wa_id = ? ORDER BY updated_at DESC LIMIT 1').get(String(waId)) || null;
}

export const extractRef = (text) => String(text || '').match(/ref:\s*([2-9A-HJ-NP-Z]{6})/i)?.[1]?.toUpperCase() || null;

/**
 * Reclama una sesión con el ref del mensaje. Reglas anti-reenvío:
 *  - el ref caduca (REF_TTL_MINUTES) y
 *  - sólo el primer número de WhatsApp que lo usa puede reclamarlo.
 * Si no hay ref válido, devuelve la última sesión del número o crea una "huérfana".
 */
export function claimSession({ waId, text, name }) {
  const t = now();
  const ref = extractRef(text);
  if (ref) {
    const s = db().prepare('SELECT * FROM sessions WHERE ref = ?').get(ref);
    if (s && s.wa_id === String(waId)) return { session: s, isNew: false, refStatus: 'already_claimed_by_you' };
    if (s && !s.wa_id && s.ref_expires_at >= t) {
      db().prepare('UPDATE sessions SET wa_id = ?, name = COALESCE(?, name), stage = ?, claimed_at = ?, updated_at = ? WHERE id = ?')
        .run(String(waId), name || null, 'chatting', t, t, s.id);
      logEvent('chat_started', { sessionId: s.id, kioskId: s.kiosk_id, data: { vehicle: s.vehicle_id } });
      return { session: getSession(s.id), isNew: true, refStatus: 'ok' };
    }
    const existing = latestSessionForWa(waId);
    if (existing) return { session: existing, isNew: false, refStatus: s ? 'expired_or_taken' : 'unknown' };
    return { session: createOrphan(waId, name, t), isNew: true, refStatus: s ? 'expired_or_taken' : 'unknown' };
  }
  const existing = latestSessionForWa(waId);
  if (existing) return { session: existing, isNew: false, refStatus: 'none' };
  return { session: createOrphan(waId, name, t), isNew: true, refStatus: 'none' };
}

function createOrphan(waId, name, t) {
  const id = uid('ses_');
  db()
    .prepare(
      `INSERT INTO sessions (id, ref, wa_id, name, stage, lang, ref_expires_at, created_at, claimed_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, `X${shortCode(5)}`, String(waId), name || null, 'chatting', 'es', t, t, t, t);
  logEvent('chat_started', { sessionId: id, data: { orphan: true } });
  return getSession(id);
}

const UPDATABLE = ['vehicle_id', 'dealer_id', 'lang', 'name', 'email', 'stage', 'bot_paused', 'crm_person_id', 'crm_opportunity_id'];

export function updateSession(id, patch) {
  const fields = Object.keys(patch).filter((k) => UPDATABLE.includes(k) && patch[k] !== undefined);
  if (patch.lang) patch.lang = normLang(patch.lang);
  if (patch.stage && !STAGES.includes(patch.stage)) throw Object.assign(new Error('invalid_stage'), { status: 400 });
  if (fields.length) {
    const sql = `UPDATE sessions SET ${fields.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
    db().prepare(sql).run(...fields.map((k) => (typeof patch[k] === 'boolean' ? Number(patch[k]) : patch[k])), now(), id);
    if (patch.stage) logEvent(`stage_${patch.stage}`, { sessionId: id });
  }
  return getSession(id);
}

export function recordConsent(sessionId, { type, version, channel = 'whatsapp', evidence = null }) {
  const id = uid('con_');
  db().prepare('INSERT INTO consents (id, session_id, type, version, channel, evidence, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, sessionId, type, version, channel, evidence ? JSON.stringify(evidence) : null, now());
  logEvent(`consent_${type}`, { sessionId });
  return id;
}

export const listConsents = (sessionId) =>
  db().prepare('SELECT type, version, channel, created_at FROM consents WHERE session_id = ? ORDER BY created_at').all(sessionId);

export const hasConsent = (sessionId, type) =>
  !!db().prepare('SELECT 1 FROM consents WHERE session_id = ? AND type = ?').get(sessionId, type);
