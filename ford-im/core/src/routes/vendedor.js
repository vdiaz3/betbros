// vendedor.menteia.com: bandeja del vendedor (conversaciones de WhatsApp en vivo, tomar/devolver
// al bot, responder), funnel de venta y agenda de pruebas de manejo.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getDb, logEvent } from '../db.js';
import { signToken, verifyToken, safeEqual } from '../lib/token.js';
import { page, esc } from '../lib/html.js';
import { rateLimit } from '../lib/auth.js';
import { getVehicle, getDealer, getBank } from '../data/catalog.js';
import { loc } from '../lib/i18n.js';
import { getSession, updateSession, listConsents, STAGES } from '../services/sessions.js';
import { listMessages } from '../services/messages.js';
import { latestCreditForSession, creditStatus } from '../services/credit.js';
import { latestKyc } from '../services/kyc.js';
import * as testdrive from '../services/testdrive.js';
import * as wa from '../services/whatsapp.js';
import { syncSession } from '../services/crm.js';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/vendedor');
const r = express.Router();
const COOKIE = 'fim_seller';
const WINDOW_MS = 24 * 3600_000;

// Agrupación de etapas en columnas (la misma que el pipeline del CRM).
export const COLUMNS = [
  { id: 'new', label: 'Nuevo lead', stages: ['scanned', 'chatting'] },
  { id: 'test_drive', label: 'Prueba de manejo', stages: ['test_drive_booked'] },
  { id: 'credit', label: 'Crédito en proceso', stages: ['credit_consent', 'kyc', 'credit_collecting', 'signing'] },
  { id: 'bank', label: 'En el banco', stages: ['sent_to_bank', 'bank_more_info'] },
  { id: 'won', label: 'Aprobado', stages: ['bank_approved', 'closed'] },
  { id: 'lost', label: 'No aprobado', stages: ['bank_rejected'] },
];

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

const READ_ONLY_USER = { user: 'demo', name: 'Demo · sólo lectura' };

function auth(req, res, next) {
  // CRM de sólo lectura (demo): sin login y sin acciones que modifiquen datos.
  if (config.crmReadOnly) {
    if (req.method !== 'GET') return res.status(403).json({ error: 'read_only' });
    if (config.crmViewKey) {
      const viaQuery = safeEqual(req.query.k, config.crmViewKey);
      if (viaQuery) {
        const secure = config.publicScheme === 'https' ? '; Secure' : '';
        res.append('Set-Cookie', `fim_view=${encodeURIComponent(signToken('view', {}, 7 * 86400))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
      } else if (!verifyToken(cookies(req).fim_view, 'view')) {
        return req.originalUrl.includes('/api/') ? res.status(401).json({ error: 'view_key_required' }) : res.status(401).send(page({ title: 'CRM', body: '<div class="card center"><p>Abre el CRM con la liga que incluye la llave de acceso.</p></div>' }));
      }
    }
    req.seller = READ_ONLY_USER;
    return next();
  }
  const p = verifyToken(cookies(req)[COOKIE], 'seller');
  const seller = p && config.sellers[p.u];
  if (!seller) return req.originalUrl.includes('/api/') ? res.status(401).json({ error: 'login_required' }) : res.redirect(302, `${req.baseUrl.replace(/\/(api|app)$/, '')}/login`);
  // Las peticiones que modifican datos deben traer la cabecera propia (protección CSRF).
  if (req.method !== 'GET' && req.get('x-fim') !== '1') return res.status(403).json({ error: 'csrf' });
  req.seller = seller;
  next();
}

// --- Login -------------------------------------------------------------------------------
const loginPage = (base, error = '') => page({
  title: 'Ford IM · Vendedores',
  body: `<div class="card"><h1>Bandeja del vendedor</h1>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="post" action="${esc(base)}/login">
    <label>Usuario<input name="user" autocomplete="username" required></label>
    <label>Llave de acceso<input name="key" type="password" autocomplete="current-password" required></label>
    <button class="btn">Entrar</button>
  </form></div>`,
});
r.get('/login', (req, res) => (config.crmReadOnly ? res.redirect(302, `${req.baseUrl}/`) : res.send(loginPage(req.baseUrl))));
r.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 20 }), express.urlencoded({ extended: false }), (req, res) => {
  const seller = config.sellers[String(req.body.user || '').trim()];
  if (!seller || !safeEqual(req.body.key, seller.key)) return res.status(401).send(loginPage(req.baseUrl, 'Usuario o llave incorrectos.'));
  const secure = config.publicScheme === 'https' ? '; Secure' : '';
  res.set('Set-Cookie', `${COOKIE}=${encodeURIComponent(signToken('seller', { u: seller.user }, 12 * 3600))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`);
  res.redirect(303, `${req.baseUrl}/`);
});
r.get('/logout', (req, res) => res.set('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`).redirect(302, `${req.baseUrl}/login`));

r.use('/app', auth, express.static(pub, { maxAge: '5m' }));
const indexHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
r.get(['/', '/funnel', '/agenda'], auth, (req, res) => res.type('html').send(indexHtml.replace('__BASE__', `${req.baseUrl}/`)));

// --- API de la bandeja -------------------------------------------------------------------
const api = express.Router();
api.use(auth, express.json({ limit: '100kb' }));
const db = () => getDb();

api.get('/me', (req, res) => res.json({ user: req.seller.user, name: req.seller.name, crm_url: config.crm.baseUrl || null, demo: config.demoMode, read_only: config.crmReadOnly }));

api.get('/conversations', (req, res) => {
  const filter = String(req.query.filter || 'all');
  const where = ['s.wa_id IS NOT NULL'];
  const args = [];
  if (filter === 'handoff') where.push('s.bot_paused = 1');
  if (filter === 'mine') { where.push('s.assigned_to = ?'); args.push(req.seller.user); }
  if (filter === 'credit') where.push(`s.stage IN ('credit_consent','kyc','credit_collecting','signing','sent_to_bank','bank_more_info')`);
  if (filter === 'test_drive') where.push(`EXISTS (SELECT 1 FROM test_drives td WHERE td.session_id = s.id AND td.status = 'booked')`);
  if (req.query.q) { where.push('(s.name LIKE ? OR s.wa_id LIKE ? OR s.ref LIKE ?)'); const q = `%${req.query.q}%`; args.push(q, q, q); }
  const rows = db().prepare(`
    SELECT s.id, s.name, s.wa_id, s.vehicle_id, s.stage, s.bot_paused, s.assigned_to, s.lang, s.updated_at, s.last_inbound_at,
      (SELECT body FROM messages m WHERE m.session_id = s.id ORDER BY id DESC LIMIT 1) AS last_body,
      (SELECT direction FROM messages m WHERE m.session_id = s.id ORDER BY id DESC LIMIT 1) AS last_dir,
      (SELECT MAX(id) FROM messages m WHERE m.session_id = s.id) AS last_msg_id
    FROM sessions s WHERE ${where.join(' AND ')} ORDER BY COALESCE(s.last_inbound_at, s.updated_at) DESC LIMIT 200`).all(...args);
  res.json(rows.map((x) => ({ ...x, bot_paused: Boolean(x.bot_paused), vehicle: x.vehicle_id ? loc(getVehicle(x.vehicle_id)?.name, 'es') : null })));
});

function details(s) {
  const credit = latestCreditForSession(s.id);
  const kyc = latestKyc(s.id);
  const td = testdrive.latestTestDrive(s.id);
  const dealer = getDealer(s.dealer_id);
  return {
    session: { ...s, bot_paused: Boolean(s.bot_paused) },
    vehicle: s.vehicle_id ? loc(getVehicle(s.vehicle_id)?.name, 'es') : null,
    dealer: dealer?.name ?? null,
    consents: listConsents(s.id).map((c) => c.type),
    kyc: kyc ? { status: kyc.status, doc_type: kyc.doc_type } : null,
    credit: credit ? (({ id, folio, bank, status, ready, simulation, missing_fields, missing_documents }) =>
      ({ id, folio, bank: bank.name, status, ready, monthly: simulation?.monthly_payment, missing: missing_fields.length + missing_documents.length }))(creditStatus(credit.id)) : null,
    test_drive: td ? testdrive.describe(td, 'es') : null,
    window_open: Boolean(s.last_inbound_at && Date.now() - s.last_inbound_at < WINDOW_MS),
  };
}

const mustSession = (id) => {
  const s = getSession(id);
  if (!s || !s.wa_id) throw Object.assign(new Error('not_found'), { status: 404 });
  return s;
};

api.get('/conversations/:id', (req, res) => {
  const s = mustSession(req.params.id);
  res.json({ ...details(s), messages: listMessages(s.id, Number(req.query.after) || 0) });
});

api.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const s = mustSession(req.params.id);
    const text = String(req.body.text || '').trim().slice(0, 4000);
    if (!text) return res.status(400).json({ error: 'text_required' });
    if (!details(s).window_open) return res.status(409).json({ error: 'outside_24h_window', hint: 'WhatsApp sólo permite plantillas aprobadas después de 24 h sin mensajes del cliente.' });
    // Si el vendedor escribe, toma la conversación y el bot se pausa.
    if (!s.bot_paused || s.assigned_to !== req.seller.user) updateSession(s.id, { bot_paused: 1, assigned_to: req.seller.user });
    await wa.sendText(s.wa_id, text, `seller:${req.seller.user}`);
    logEvent('seller_message', { sessionId: s.id, data: { seller: req.seller.user } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

api.post('/conversations/:id/take', (req, res) => {
  const s = updateSession(mustSession(req.params.id).id, { bot_paused: 1, assigned_to: req.seller.user });
  logEvent('seller_take', { sessionId: s.id, data: { seller: req.seller.user } });
  syncSession(s, { note: { title: `👤 ${req.seller.name} tomó la conversación`, body: '' } }).catch(() => {});
  res.json(details(s));
});

api.post('/conversations/:id/release', (req, res) => {
  const s = updateSession(mustSession(req.params.id).id, { bot_paused: 0 });
  logEvent('seller_release', { sessionId: s.id, data: { seller: req.seller.user } });
  res.json(details(s));
});

api.patch('/conversations/:id/stage', (req, res) => {
  if (!STAGES.includes(req.body.stage)) return res.status(400).json({ error: 'invalid_stage' });
  res.json(details(updateSession(mustSession(req.params.id).id, { stage: req.body.stage })));
});

// Funnel: sesiones distintas que alcanzaron cada paso en el periodo.
const FUNNEL = [
  { id: 'scans', label: 'Escaneos del QR', events: ['qr_scanned'] },
  { id: 'chats', label: 'Conversaciones en WhatsApp', events: ['chat_started'] },
  { id: 'credit', label: 'Aceptaron aviso de crédito', events: ['consent_credit_privacy'] },
  { id: 'kyc', label: 'Identidad verificada (KYC)', events: ['kyc_approved'] },
  { id: 'signed', label: 'Firmaron y se envió al banco', events: ['sent_to_bank'] },
  { id: 'approved', label: 'Crédito aprobado', events: ['stage_bank_approved'] },
];

api.get('/funnel', (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const since = Date.now() - days * 86_400_000;
  const count = (types) => db().prepare(`SELECT COUNT(DISTINCT COALESCE(session_id, id)) n FROM events WHERE created_at >= ? AND type IN (${types.map(() => '?').join(',')})`).get(since, ...types).n;
  const funnel = FUNNEL.map((f) => ({ id: f.id, label: f.label, count: count(f.events) }));
  const sessions = db().prepare('SELECT id, name, wa_id, vehicle_id, stage, assigned_to, bot_paused, updated_at FROM sessions WHERE wa_id IS NOT NULL AND updated_at >= ? ORDER BY updated_at DESC').all(since);
  const columns = COLUMNS.map((c) => ({
    id: c.id, label: c.label,
    leads: sessions.filter((s) => c.stages.includes(s.stage)).map((s) => ({
      id: s.id, name: s.name || s.wa_id, vehicle: s.vehicle_id ? loc(getVehicle(s.vehicle_id)?.name, 'es') : null,
      assigned_to: s.assigned_to, bot_paused: Boolean(s.bot_paused), updated_at: s.updated_at,
    })),
  }));
  const tiles = {
    test_drives_booked: count(['test_drive_booked']),
    test_drives_done: count(['test_drive_done']),
    handoffs: count(['handoff', 'seller_take']),
    voice_agent: db().prepare("SELECT COUNT(*) n FROM events WHERE type = 'voice_agent_started' AND created_at >= ?").get(since).n,
  };
  const byVehicle = db().prepare('SELECT vehicle_id, COUNT(*) n FROM sessions WHERE wa_id IS NOT NULL AND created_at >= ? GROUP BY vehicle_id ORDER BY n DESC').all(since)
    .map((x) => ({ vehicle: x.vehicle_id ? loc(getVehicle(x.vehicle_id)?.name, 'es') : 'Sin modelo', count: x.n }));
  const bankRows = db().prepare('SELECT bank_id, status, COUNT(*) n FROM credit_apps WHERE created_at >= ? GROUP BY bank_id, status').all(since)
    .map((x) => ({ bank: getBank(x.bank_id)?.name ?? x.bank_id, status: x.status, count: x.n }));
  res.json({ days, funnel, columns, tiles, byVehicle, banks: bankRows });
});

api.get('/agenda', (req, res) => {
  res.json(testdrive.upcomingTestDrives().map((td) => ({
    ...testdrive.describe(td, 'es'), session_id: td.session_id, name: td.name || td.wa_id, assigned_to: td.assigned_to,
  })));
});

api.post('/test-drives/:id', (req, res) => {
  const td = testdrive.setTestDriveStatus(req.params.id, req.body.status);
  if (!td) return res.status(404).json({ error: 'not_found' });
  res.json(testdrive.describe(td, 'es'));
});

api.use((err, req, res, _next) => {
  if (!err.status || err.status >= 500) console.error('[vendedor]', err);
  res.status(err.status || 500).json({ error: err.message });
});

r.use('/api', api);
export default r;
