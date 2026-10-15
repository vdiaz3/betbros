// KYC breve (kyc.menteia.com): INE frente/reverso + selfie + CURP.
// Proveedor `manual`: valida formato de CURP y archivos, guarda y deja la revisión al F&I.
// Proveedor `webhook`: reenvía el expediente a un verificador externo (Truora, MetaMap,
// Incode, etc.), que responde en /kyc/callback con el resultado de match facial y lista nominal.
import { getDb, now, uid, logEvent } from '../db.js';
import { config } from '../config.js';
import { isValidCurp, saveDocument } from './credit.js';

const db = () => getDb();

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

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export async function submitKyc(kycId, { curp, files, consent, userAgent, ip }) {
  const kyc = getKyc(kycId);
  if (!kyc || kyc.status !== 'pending') throw Object.assign(new Error('kyc_not_pending'), { status: 409 });
  const errors = [];
  if (!consent) errors.push('consent_required');
  if (!isValidCurp(curp)) errors.push('invalid_curp');
  for (const k of ['ine_frente', 'ine_reverso', 'selfie']) {
    const f = files[k];
    if (!f) errors.push(`missing_${k}`);
    else if (!ALLOWED.includes(f.mimetype)) errors.push(`bad_type_${k}`);
    else if (f.size < 20_000) errors.push(`too_small_${k}`); // fotos ilegibles / miniaturas
  }
  if (errors.length) return { ok: false, errors };

  const saved = {};
  for (const k of ['ine_frente', 'ine_reverso', 'selfie']) {
    saved[k] = saveDocument({ sessionId: kyc.session_id, kind: `kyc_${k}`, buffer: files[k].buffer, mime: files[k].mimetype, filename: files[k].originalname });
  }
  // Las fotos de INE también cuentan como anexos del crédito (si hay solicitud abierta).
  const credit = db().prepare("SELECT id FROM credit_apps WHERE session_id = ? AND status IN ('collecting','ready') ORDER BY created_at DESC LIMIT 1").get(kyc.session_id);
  if (credit) {
    for (const k of ['ine_frente', 'ine_reverso']) {
      if (!db().prepare('SELECT 1 FROM documents WHERE credit_id = ? AND kind = ?').get(credit.id, k)) {
        saveDocument({ sessionId: kyc.session_id, creditId: credit.id, kind: k, buffer: files[k].buffer, mime: files[k].mimetype, filename: files[k].originalname });
      }
    }
  }

  let status = 'submitted';
  let result = { provider: config.kyc.provider, curp_format: 'valid', consent: { at: now(), ip, userAgent }, files: saved };
  if (config.kyc.provider === 'webhook' && config.kyc.webhookUrl) {
    try {
      const form = new FormData();
      form.append('kyc_id', kycId);
      form.append('curp', curp.toUpperCase());
      for (const k of ['ine_frente', 'ine_reverso', 'selfie']) form.append(k, new Blob([files[k].buffer], { type: files[k].mimetype }), files[k].originalname || k);
      const res = await fetch(config.kyc.webhookUrl, { method: 'POST', body: form });
      result.provider_response = await res.json().catch(() => ({ status: res.status }));
    } catch (err) {
      result.provider_error = err.message;
    }
  }
  db().prepare('UPDATE kyc_checks SET status = ?, curp = ?, result_json = ?, updated_at = ? WHERE id = ?')
    .run(status, curp.toUpperCase(), JSON.stringify(result), now(), kycId);
  logEvent('kyc_submitted', { sessionId: kyc.session_id });
  return { ok: true, kyc: getKyc(kycId) };
}

export function setKycResult(kycId, status, details) {
  if (!['approved', 'rejected', 'review'].includes(status)) throw Object.assign(new Error('invalid_status'), { status: 400 });
  const kyc = getKyc(kycId);
  const result = { ...(kyc.result_json ? JSON.parse(kyc.result_json) : {}), decision: details };
  db().prepare('UPDATE kyc_checks SET status = ?, result_json = ?, updated_at = ? WHERE id = ?').run(status, JSON.stringify(result), now(), kycId);
  logEvent(`kyc_${status}`, { sessionId: kyc.session_id });
  return getKyc(kycId);
}
