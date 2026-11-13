// Debida diligencia PLD (Ley Antilavado, LFPIORPI) para la venta de vehículos: cuestionario del
// cliente, cotejo contra listas, umbrales de identificación y aviso al SAT, límite de efectivo y
// nivel de riesgo. El resultado queda en pld_checks y lo ven el vendedor (CRM) y el agente.
import { getDb, now, uid, logEvent } from '../db.js';
import { config } from '../config.js';
import { getVehicle } from '../data/catalog.js';
import { getSession } from './sessions.js';

const db = () => getDb();

export const ORIGENES = ['salario', 'negocio', 'ahorro', 'venta_bien', 'herencia', 'otro'];
export const PAGOS = ['credito', 'transferencia', 'cheque', 'efectivo', 'mixto'];

// Listas que se cotejan. En el demo el cotejo es simulado: sólo coincide la CURP de prueba.
const LISTS = ['Lista de Personas Bloqueadas (UIF)', 'OFAC SDN', 'Consejo de Seguridad ONU'];
export const DEMO_LIST_HIT_CURP = 'XEXX010101HNEXXXA4';

const bool = (v) => v === true || v === '1' || v === 'true' || v === 'si' || v === 'sí';
const money = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0));

export function normalizeAnswers(raw = {}) {
  return {
    ocupacion: String(raw.ocupacion || '').trim().slice(0, 120),
    origen_recursos: String(raw.origen_recursos || ''),
    forma_pago: String(raw.forma_pago || ''),
    efectivo_mxn: money(raw.efectivo_mxn),
    cuenta_propia: raw.cuenta_propia === undefined ? true : bool(raw.cuenta_propia),
    beneficiario: String(raw.beneficiario || '').trim().slice(0, 160),
    pep: bool(raw.pep),
  };
}

export function validateAnswers(a) {
  const errors = [];
  if (a.ocupacion.length < 3) errors.push('pld_ocupacion');
  if (!ORIGENES.includes(a.origen_recursos)) errors.push('pld_origen');
  if (!PAGOS.includes(a.forma_pago)) errors.push('pld_pago');
  if (!a.cuenta_propia && a.beneficiario.length < 5) errors.push('pld_beneficiario');
  return errors;
}

export function thresholds() {
  const { umaMxn, identificationUma, noticeUma, cashLimitUma } = config.pld;
  return {
    uma_mxn: umaMxn,
    identification_mxn: Math.round(identificationUma * umaMxn),
    notice_mxn: Math.round(noticeUma * umaMxn),
    cash_limit_mxn: Math.round(cashLimitUma * umaMxn),
  };
}

function screen({ curp, name }) {
  if (config.pld.screening !== 'simulated') return { provider: 'manual', lists: LISTS, hit: null, pending: true };
  const hit = String(curp || '').toUpperCase() === DEMO_LIST_HIT_CURP;
  return { provider: 'simulated', lists: LISTS, hit, name: name || null };
}

/** Evalúa la operación sin guardar nada (también lo usa la prueba de la landing). */
export function evaluate({ answers, amountMxn, curp, name }) {
  const th = thresholds();
  const screening = screen({ curp, name });
  const cashPaid = ['efectivo', 'mixto'].includes(answers.forma_pago) ? answers.efectivo_mxn || (answers.forma_pago === 'efectivo' ? amountMxn : 0) : 0;
  const flags = [];
  if (screening.hit) flags.push('list_hit');
  if (cashPaid >= th.cash_limit_mxn) flags.push('cash_over_limit');
  if (answers.pep) flags.push('pep');
  if (!answers.cuenta_propia) flags.push('third_party');
  if (answers.origen_recursos === 'otro') flags.push('origin_other');

  const risk = flags.some((f) => ['list_hit', 'cash_over_limit', 'pep'].includes(f)) ? 'alto'
    : flags.length || cashPaid > 0 || amountMxn >= th.notice_mxn ? 'medio' : 'bajo';
  const status = screening.hit ? 'blocked' : risk === 'alto' || flags.includes('third_party') ? 'review' : screening.pending ? 'review' : 'clear';

  const obligations = [];
  if (amountMxn >= th.identification_mxn) obligations.push('identification');
  if (amountMxn >= th.notice_mxn) obligations.push('sat_notice');
  if (!answers.cuenta_propia) obligations.push('beneficial_owner');
  return { status, risk, flags, obligations, amount_mxn: amountMxn, cash_mxn: cashPaid, thresholds: th, screening };
}

export function assessPld({ sessionId, kycId = null, answers, curp }) {
  const s = getSession(sessionId);
  const amountMxn = getVehicle(s?.vehicle_id)?.price_from_mxn || 0;
  const result = evaluate({ answers, amountMxn, curp, name: s?.name });
  const id = uid('pld_');
  db().prepare('INSERT INTO pld_checks (id, session_id, kyc_id, status, risk, answers_json, result_json, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, sessionId, kycId, result.status, result.risk, JSON.stringify(answers), JSON.stringify(result), now());
  logEvent('pld_assessed', { sessionId, data: { status: result.status, risk: result.risk, flags: result.flags } });
  return { id, ...result };
}

export function latestPld(sessionId) {
  const row = db().prepare('SELECT * FROM pld_checks WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(sessionId);
  if (!row) return null;
  return { id: row.id, status: row.status, risk: row.risk, answers: JSON.parse(row.answers_json), ...JSON.parse(row.result_json), created_at: row.created_at };
}

// Resumen sin datos personales para el agente de WhatsApp y el expediente de crédito.
export const pldSummary = (p) => (p ? { status: p.status, risk: p.risk, flags: p.flags, obligations: p.obligations } : null);
