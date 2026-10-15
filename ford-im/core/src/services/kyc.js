// KYC (kyc.menteia.com): identificación (INE por ambos lados o pasaporte) + prueba de vida
// (selfie y 3 retos aleatorios frente a la cámara) + CURP. Es requisito para abrir la solicitud
// de crédito.
//
// Proveedores:
//  - simulated: para demos. Genera puntajes realistas y aprueba si el expediente está completo
//    y la CURP es válida. NO verifica identidad real.
//  - manual:    guarda y deja la revisión al F&I del distribuidor (POST /v1/kyc/:id/result).
//  - webhook:   reenvía el expediente a un verificador externo (Truora, MetaMap, Incode…).
import crypto from 'node:crypto';
import { getDb, now, uid, logEvent } from '../db.js';
import { config } from '../config.js';
import { isValidCurp, saveDocument } from './credit.js';

const db = () => getDb();

export const DOC_TYPES = {
  ine: { files: ['doc_frente', 'doc_reverso'], label: { es: 'INE', en: 'INE (Mexican voter ID)' } },
  pasaporte: { files: ['doc_frente'], label: { es: 'Pasaporte', en: 'Passport' } },
};
export const LIVENESS_CHALLENGES = ['turn_left', 'turn_right', 'smile', 'blink', 'look_up'];

export function startKyc(sessionId) {
  const open = db().prepare("SELECT * FROM kyc_checks WHERE session_id = ? AND status IN ('pending','submitted','approved') ORDER BY created_at DESC LIMIT 1").get(sessionId);
  if (open) return open;
  const t = now();
  const id = uid('kyc_');
  db().prepare('INSERT INTO kyc_checks (id, session_id, created_at, updated_at) VALUES (?,?,?,?)').run(id, sessionId, t, t);
  logEvent('kyc_started', { sessionId });
  return getKyc(id);
}

export const getKyc = (id) => db().prepare('SELECT * FROM kyc_checks WHERE id = ?').get(id) || null;
export const latestKyc = (sessionId) => db().prepare('SELECT * FROM kyc_checks WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(sessionId) || null;
export const isKycApproved = (sessionId) => latestKyc(sessionId)?.status === 'approved';

// Retos de prueba de vida: 3 distintos, elegidos al azar por intento (evita videos pregrabados).
export function pickChallenges() {
  const pool = [...LIVENESS_CHALLENGES];
  const out = [];
  while (out.length < 3) out.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
  return out;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function validate({ docType, curp, files, consent, challenges }) {
  const errors = [];
  if (!consent) errors.push('consent_required');
  if (!DOC_TYPES[docType]) errors.push('invalid_doc_type');
  if (!isValidCurp(curp)) errors.push('invalid_curp');
  const required = [...(DOC_TYPES[docType]?.files || []), 'selfie', ...challenges.map((_, i) => `liveness_${i}`)];
  for (const k of required) {
    const f = files[k];
    if (!f) errors.push(`missing_${k}`);
    else if (!IMAGE_TYPES.includes(f.mimetype)) errors.push(`bad_type_${k}`);
    else if (f.size < 8_000) errors.push(`too_small_${k}`); // miniatura o imagen vacía
  }
  if (challenges.length !== 3 || challenges.some((c) => !LIVENESS_CHALLENGES.includes(c))) errors.push('invalid_challenges');
  return errors;
}

// Puntajes simulados, deterministas por expediente (mismo expediente → mismo resultado).
function simulatedAnalysis({ docType, curp, files, challenges }) {
  const seed = crypto.createHash('sha256').update(curp + Object.values(files).map((f) => f.size).join('-')).digest();
  const score = (i, min, max) => Math.round((min + (seed[i] / 255) * (max - min)) * 1000) / 1000;
  const checks = [
    { id: 'document_detected', label: { es: `${DOC_TYPES[docType].label.es} detectada`, en: `${DOC_TYPES[docType].label.en} detected` }, ok: true },
    { id: 'document_authenticity', label: { es: 'Elementos de seguridad del documento', en: 'Document security features' }, ok: true, score: score(0, 0.9, 0.99) },
    { id: 'data_extraction', label: { es: docType === 'pasaporte' ? 'Lectura de zona MRZ' : 'Lectura OCR de datos', en: docType === 'pasaporte' ? 'MRZ read' : 'OCR data read' }, ok: true },
    { id: 'liveness', label: { es: 'Prueba de vida (3 retos)', en: 'Liveness (3 challenges)' }, ok: true, score: score(1, 0.93, 0.995), challenges },
    { id: 'face_match', label: { es: 'Rostro coincide con la identificación', en: 'Face matches the ID' }, ok: true, score: score(2, 0.88, 0.98) },
    { id: 'curp', label: { es: 'CURP con formato y dígito verificador válidos', en: 'CURP format and check digit valid' }, ok: true },
  ];
  return { provider: 'simulated', approved: true, checks, disclaimer: 'Resultado SIMULADO para demostración. No constituye verificación de identidad.' };
}

export async function submitKyc(kycId, { docType, curp, files, consent, challenges = [], userAgent, ip }) {
  const kyc = getKyc(kycId);
  if (!kyc || kyc.status !== 'pending') throw Object.assign(new Error('kyc_not_pending'), { status: 409 });
  curp = String(curp || '').toUpperCase().trim();
  const errors = validate({ docType, curp, files, consent, challenges });
  if (errors.length) return { ok: false, errors };

  const saved = {};
  for (const [k, f] of Object.entries(files)) {
    saved[k] = saveDocument({ sessionId: kyc.session_id, kind: `kyc_${docType}_${k}`, buffer: f.buffer, mime: f.mimetype, filename: f.originalname || `${k}.jpg` });
  }

  let status = 'submitted';
  let analysis = null;
  if (config.kyc.provider === 'simulated') {
    analysis = simulatedAnalysis({ docType, curp, files, challenges });
    status = analysis.approved ? 'approved' : 'rejected';
  } else if (config.kyc.provider === 'webhook' && config.kyc.webhookUrl) {
    try {
      const form = new FormData();
      form.append('kyc_id', kycId);
      form.append('doc_type', docType);
      form.append('curp', curp);
      form.append('challenges', JSON.stringify(challenges));
      for (const [k, f] of Object.entries(files)) form.append(k, new Blob([f.buffer], { type: f.mimetype }), f.originalname || k);
      const res = await fetch(config.kyc.webhookUrl, { method: 'POST', body: form });
      analysis = { provider: 'webhook', response: await res.json().catch(() => ({ status: res.status })) };
    } catch (err) {
      analysis = { provider: 'webhook', error: err.message };
    }
  }

  const result = { consent: { at: now(), ip, userAgent }, files: saved, challenges, analysis };
  db().prepare('UPDATE kyc_checks SET status = ?, curp = ?, doc_type = ?, result_json = ?, updated_at = ? WHERE id = ?')
    .run(status, curp, docType, JSON.stringify(result), now(), kycId);
  logEvent('kyc_submitted', { sessionId: kyc.session_id, data: { doc_type: docType } });
  if (status === 'approved') logEvent('kyc_approved', { sessionId: kyc.session_id });
  return { ok: true, kyc: getKyc(kycId), analysis };
}

export function setKycResult(kycId, status, details) {
  if (!['approved', 'rejected', 'review'].includes(status)) throw Object.assign(new Error('invalid_status'), { status: 400 });
  const kyc = getKyc(kycId);
  if (!kyc) throw Object.assign(new Error('kyc_not_found'), { status: 404 });
  const result = { ...(kyc.result_json ? JSON.parse(kyc.result_json) : {}), decision: details };
  db().prepare('UPDATE kyc_checks SET status = ?, result_json = ?, updated_at = ? WHERE id = ?').run(status, JSON.stringify(result), now(), kycId);
  logEvent(`kyc_${status}`, { sessionId: kyc.session_id });
  return getKyc(kycId);
}

// Copia la identificación verificada en el KYC como anexo de la solicitud de crédito.
export function attachKycDocsToCredit(sessionId, creditId) {
  const kyc = latestKyc(sessionId);
  if (kyc?.status !== 'approved') return [];
  const map = kyc.doc_type === 'pasaporte' ? { doc_frente: 'pasaporte' } : { doc_frente: 'ine_frente', doc_reverso: 'ine_reverso' };
  const attached = [];
  for (const [src, kind] of Object.entries(map)) {
    if (db().prepare('SELECT 1 FROM documents WHERE credit_id = ? AND kind = ?').get(creditId, kind)) continue;
    const doc = db().prepare('SELECT * FROM documents WHERE session_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1').get(sessionId, `kyc_${kyc.doc_type}_${src}`);
    if (!doc) continue;
    db().prepare('INSERT INTO documents (id, session_id, credit_id, kind, filename, mime, path, sha256, size, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(uid('doc_'), sessionId, creditId, kind, doc.filename.replace(/^kyc_[a-z]+_doc_[a-z]+/, kind), doc.mime, doc.path, doc.sha256, doc.size, now());
    attached.push(kind);
  }
  return attached;
}
