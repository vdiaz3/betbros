// Solicitud de crédito automotriz: esquema de datos, validación, simulador y documentos.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb, now, uid, shortCode, filesDir, logEvent } from '../db.js';
import { getBank } from '../data/catalog.js';

// Campos que el agente debe recabar. `label` sirve para que el agente pregunte en el idioma del cliente.
export const FIELDS = {
  // Solicitante
  nombres: { label: { es: 'Nombre(s)', en: 'First name(s)' }, required: true },
  apellido_paterno: { label: { es: 'Apellido paterno', en: 'Last name' }, required: true },
  apellido_materno: { label: { es: 'Apellido materno', en: 'Second last name' }, required: false },
  fecha_nacimiento: { label: { es: 'Fecha de nacimiento (AAAA-MM-DD)', en: 'Date of birth (YYYY-MM-DD)' }, required: true, type: 'date' },
  curp: { label: { es: 'CURP', en: 'CURP' }, required: true, type: 'curp' },
  rfc: { label: { es: 'RFC con homoclave', en: 'RFC (tax ID)' }, required: true, type: 'rfc' },
  estado_civil: { label: { es: 'Estado civil', en: 'Marital status' }, required: true, options: ['soltero', 'casado', 'union_libre', 'divorciado', 'viudo'] },
  dependientes: { label: { es: 'Número de dependientes', en: 'Number of dependents' }, required: true, type: 'int' },
  email: { label: { es: 'Correo electrónico', en: 'Email' }, required: true, type: 'email' },
  telefono: { label: { es: 'Teléfono', en: 'Phone' }, required: true, type: 'phone' },
  // Domicilio
  calle_numero: { label: { es: 'Calle y número', en: 'Street and number' }, required: true },
  colonia: { label: { es: 'Colonia', en: 'Neighborhood' }, required: true },
  municipio: { label: { es: 'Municipio / Alcaldía', en: 'Municipality' }, required: true },
  estado: { label: { es: 'Estado', en: 'State' }, required: true },
  cp: { label: { es: 'Código postal', en: 'ZIP code' }, required: true, type: 'cp' },
  tipo_vivienda: { label: { es: 'Vivienda (propia, rentada, familiar, hipotecada)', en: 'Housing (owned, rented, family, mortgaged)' }, required: true, options: ['propia', 'rentada', 'familiar', 'hipotecada'] },
  anios_domicilio: { label: { es: 'Años en el domicilio', en: 'Years at address' }, required: true, type: 'number' },
  // Empleo
  tipo_ingreso: { label: { es: 'Tipo de ingreso (asalariado, independiente, empresario, pensionado)', en: 'Income type (salaried, self-employed, business owner, retired)' }, required: true, options: ['asalariado', 'independiente', 'empresario', 'pensionado'] },
  empresa: { label: { es: 'Empresa / Actividad', en: 'Employer / Business' }, required: true },
  puesto: { label: { es: 'Puesto', en: 'Position' }, required: false },
  antiguedad_laboral_anios: { label: { es: 'Antigüedad laboral (años)', en: 'Years at job' }, required: true, type: 'number' },
  ingreso_mensual_mxn: { label: { es: 'Ingreso mensual neto (MXN)', en: 'Net monthly income (MXN)' }, required: true, type: 'money' },
  // Crédito
  precio_vehiculo_mxn: { label: { es: 'Precio del vehículo (MXN)', en: 'Vehicle price (MXN)' }, required: true, type: 'money' },
  version: { label: { es: 'Versión', en: 'Trim' }, required: false },
  enganche_mxn: { label: { es: 'Enganche (MXN)', en: 'Down payment (MXN)' }, required: true, type: 'money' },
  plazo_meses: { label: { es: 'Plazo (meses)', en: 'Term (months)' }, required: true, type: 'int' },
  // Referencias
  ref1_nombre: { label: { es: 'Referencia 1: nombre', en: 'Reference 1: name' }, required: true },
  ref1_telefono: { label: { es: 'Referencia 1: teléfono', en: 'Reference 1: phone' }, required: true, type: 'phone' },
  ref1_relacion: { label: { es: 'Referencia 1: relación', en: 'Reference 1: relationship' }, required: true },
  ref2_nombre: { label: { es: 'Referencia 2: nombre', en: 'Reference 2: name' }, required: true },
  ref2_telefono: { label: { es: 'Referencia 2: teléfono', en: 'Reference 2: phone' }, required: true, type: 'phone' },
  ref2_relacion: { label: { es: 'Referencia 2: relación', en: 'Reference 2: relationship' }, required: true },
};

export const DOCS = {
  ine_frente: { label: { es: 'INE (frente)', en: 'INE / ID (front)' }, required: true },
  ine_reverso: { label: { es: 'INE (reverso)', en: 'INE / ID (back)' }, required: true },
  comprobante_domicilio: { label: { es: 'Comprobante de domicilio (máx. 3 meses)', en: 'Proof of address (≤ 3 months)' }, required: true },
  comprobante_ingresos: { label: { es: 'Comprobantes de ingresos (3 últimos meses)', en: 'Proof of income (last 3 months)' }, required: true },
  constancia_fiscal: { label: { es: 'Constancia de situación fiscal', en: 'Tax status certificate' }, required: false },
};

// --- Validadores --------------------------------------------------------------------------

const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

// Dígito verificador de la CURP (algoritmo de RENAPO).
export function isValidCurp(value) {
  const curp = String(value || '').toUpperCase().trim();
  if (!CURP_RE.test(curp)) return false;
  const dict = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += dict.indexOf(curp[i]) * (18 - i);
  const digit = (10 - (sum % 10)) % 10;
  return digit === Number(curp[17]);
}

export const isValidRfc = (v) => /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/.test(String(v || '').toUpperCase().trim());

function validateField(key, raw) {
  const def = FIELDS[key];
  if (!def) return { ok: false, error: 'unknown_field' };
  let v = typeof raw === 'string' ? raw.trim() : raw;
  if (v === '' || v === null || v === undefined) return { ok: false, error: 'empty' };
  switch (def.type) {
    case 'curp': v = String(v).toUpperCase(); return isValidCurp(v) ? { ok: true, v } : { ok: false, error: 'invalid_curp' };
    case 'rfc': v = String(v).toUpperCase(); return isValidRfc(v) ? { ok: true, v } : { ok: false, error: 'invalid_rfc' };
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { ok: true, v: String(v).toLowerCase() } : { ok: false, error: 'invalid_email' };
    case 'phone': { const d = String(v).replace(/\D/g, ''); return d.length >= 10 ? { ok: true, v: d } : { ok: false, error: 'invalid_phone' }; }
    case 'cp': return /^\d{5}$/.test(String(v)) ? { ok: true, v: String(v) } : { ok: false, error: 'invalid_cp' };
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return { ok: false, error: 'invalid_date' };
      const age = (Date.now() - Date.parse(v)) / (365.25 * 86_400_000);
      return age >= 18 && age <= 90 ? { ok: true, v } : { ok: false, error: 'age_out_of_range' };
    }
    case 'int': case 'number': case 'money': {
      const n = Number(String(v).replace(/[$,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'invalid_number' };
      return { ok: true, v: def.type === 'int' ? Math.round(n) : n };
    }
    default:
      if (def.options) {
        const s = String(v).toLowerCase().replace(/\s+/g, '_');
        return def.options.includes(s) ? { ok: true, v: s } : { ok: false, error: `one_of:${def.options.join('|')}` };
      }
      return { ok: true, v: String(v).slice(0, 200) };
  }
}

// Reglas que dependen del banco (enganche mínimo y plazos permitidos).
function crossChecks(data, bank) {
  const errors = {};
  if (data.precio_vehiculo_mxn && data.enganche_mxn !== undefined) {
    const pct = (data.enganche_mxn / data.precio_vehiculo_mxn) * 100;
    if (pct < bank.min_down_payment_pct) errors.enganche_mxn = `min_down_payment_pct:${bank.min_down_payment_pct}`;
    if (data.enganche_mxn >= data.precio_vehiculo_mxn) errors.enganche_mxn = 'down_payment_exceeds_price';
  }
  if (data.plazo_meses && !bank.terms_months.includes(data.plazo_meses)) errors.plazo_meses = `allowed:${bank.terms_months.join('|')}`;
  return errors;
}

// --- Simulador (informativo; el CAT oficial lo calcula y publica el banco) ---------------

export function simulate({ price, downPayment, termMonths, ratePct, ivaOnInterest = true }) {
  const principal = price - downPayment;
  const r = (ratePct / 100 / 12) * (ivaOnInterest ? 1.16 : 1);
  const payment = r === 0 ? principal / termMonths : (principal * r) / (1 - (1 + r) ** -termMonths);
  return {
    principal: round2(principal),
    monthly_payment: round2(payment),
    total_paid: round2(payment * termMonths + downPayment),
    rate_annual_pct: ratePct,
    term_months: termMonths,
    disclaimer: {
      es: 'Simulación informativa sin valor contractual. No incluye seguros, comisiones ni CAT; sujeto a aprobación del banco.',
      en: 'Informational estimate only, not an offer. Excludes insurance, fees and APR (CAT); subject to bank approval.',
    },
  };
}
const round2 = (n) => Math.round(n * 100) / 100;

// --- Persistencia -------------------------------------------------------------------------

const db = () => getDb();
const parse = (row) => (row ? { ...row, data: JSON.parse(row.data_json), decision: row.decision_json ? JSON.parse(row.decision_json) : row.decision } : null);

export function startCredit(sessionId, bankId) {
  const bank = getBank(bankId);
  if (!bank) throw Object.assign(new Error('unknown_bank'), { status: 400 });
  const open = db().prepare("SELECT * FROM credit_apps WHERE session_id = ? AND bank_id = ? AND status IN ('collecting','ready')").get(sessionId, bankId);
  if (open) return parse(open);
  const t = now();
  const id = uid('cre_');
  const folio = `FIM-${new Date().getFullYear()}-${shortCode(6)}`;
  db().prepare('INSERT INTO credit_apps (id, folio, session_id, bank_id, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(id, folio, sessionId, bankId, t, t);
  logEvent('credit_started', { sessionId, data: { bank: bankId } });
  return getCredit(id);
}

export const getCredit = (id) => parse(db().prepare('SELECT * FROM credit_apps WHERE id = ?').get(id));
export const getCreditByEnvelope = (envId) => parse(db().prepare('SELECT * FROM credit_apps WHERE envelope_id = ?').get(envId));
export const latestCreditForSession = (sid) => parse(db().prepare('SELECT * FROM credit_apps WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(sid));

export function updateCreditData(id, fields) {
  const credit = getCredit(id);
  if (!credit) throw Object.assign(new Error('credit_not_found'), { status: 404 });
  if (!['collecting', 'ready'].includes(credit.status)) throw Object.assign(new Error('credit_locked'), { status: 409 });
  const data = { ...credit.data };
  const errors = {};
  for (const [k, raw] of Object.entries(fields || {})) {
    const r = validateField(k, raw);
    if (r.ok) data[k] = r.v;
    else errors[k] = r.error;
  }
  Object.assign(errors, crossChecks(data, getBank(credit.bank_id)));
  for (const k of Object.keys(errors)) if (k in fields) delete data[k];
  db().prepare('UPDATE credit_apps SET data_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), now(), id);
  return { ...creditStatus(id), errors };
}

export function listDocuments(creditId) {
  return db().prepare('SELECT id, kind, filename, mime, size, sha256, path, created_at FROM documents WHERE credit_id = ? ORDER BY created_at').all(creditId);
}

export function creditStatus(id) {
  const credit = getCredit(id);
  const docs = listDocuments(id);
  const missingFields = Object.entries(FIELDS)
    .filter(([k, d]) => d.required && (credit.data[k] === undefined || credit.data[k] === ''))
    .map(([k, d]) => ({ key: k, label: d.label }));
  const missingDocs = Object.entries(DOCS)
    .filter(([k, d]) => (d.required || (k === 'constancia_fiscal' && ['independiente', 'empresario'].includes(credit.data.tipo_ingreso))) && !docs.some((x) => x.kind === k))
    .map(([k, d]) => ({ key: k, label: d.label }));
  const ready = missingFields.length === 0 && missingDocs.length === 0;
  if (ready && credit.status === 'collecting') {
    db().prepare("UPDATE credit_apps SET status = 'ready', updated_at = ? WHERE id = ?").run(now(), id);
    credit.status = 'ready';
  }
  const bank = getBank(credit.bank_id);
  const sim = credit.data.precio_vehiculo_mxn && credit.data.enganche_mxn !== undefined && credit.data.plazo_meses
    ? simulate({ price: credit.data.precio_vehiculo_mxn, downPayment: credit.data.enganche_mxn, termMonths: credit.data.plazo_meses, ratePct: bank.rate_annual_pct, ivaOnInterest: bank.iva_on_interest })
    : null;
  return {
    id: credit.id, folio: credit.folio, bank: { id: bank.id, name: bank.name }, status: credit.status,
    data: credit.data, documents: docs.map(({ path: _p, ...d }) => d), missing_fields: missingFields, missing_documents: missingDocs,
    ready, simulation: sim,
  };
}

export function saveDocument({ sessionId, creditId = null, kind, buffer, mime, filename }) {
  if (creditId && !DOCS[kind] && !['solicitud_firmada', 'solicitud'].includes(kind)) throw Object.assign(new Error('unknown_document_kind'), { status: 400 });
  const id = uid('doc_');
  const ext = path.extname(filename || '') || ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf', 'image/webp': '.webp' })[mime] || '';
  const dir = filesDir(sessionId);
  const file = path.join(dir, `${id}${ext}`);
  fs.writeFileSync(file, buffer, { mode: 0o600 });
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  db().prepare('INSERT INTO documents (id, session_id, credit_id, kind, filename, mime, path, sha256, size, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, sessionId, creditId, kind, `${kind}${ext}`, mime, file, sha256, buffer.length, now());
  return { id, kind, sha256, size: buffer.length };
}

export function setCreditStatus(id, status, extra = {}) {
  const sets = ['status = ?', 'updated_at = ?'];
  const vals = [status, now()];
  if (extra.envelope_id) { sets.push('envelope_id = ?'); vals.push(extra.envelope_id); }
  if (extra.decision) { sets.push('decision = ?', 'decision_json = ?'); vals.push(extra.decision.status, JSON.stringify(extra.decision)); }
  db().prepare(`UPDATE credit_apps SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return getCredit(id);
}
