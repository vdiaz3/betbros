// Vamo Mesa (cotizador.menteia.com/mesa): landing, portal del empleado, kiosco, cocina,
// tablero de pase (sin papel), tickets para impresora térmica y encuestas de satisfacción.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config, publicUrl } from '../config.js';
import { signToken, verifyToken, safeEqual } from '../lib/token.js';
import { rateLimit } from '../lib/auth.js';
import * as mesa from './service.js';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/mesa');
const r = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

mesa.setSurveyBase(() => publicUrl('mesa', ''));

// Llave del personal (cocina, pase, kiosco): MESA_STAFF_KEY o derivada del secreto del servidor.
export const staffKey = () => process.env.MESA_STAFF_KEY || crypto.createHmac('sha256', config.secret).update('mesa:staff').digest('base64url').slice(0, 22);

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const setCookie = (res, name, value, maxAge) =>
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.publicScheme === 'https' ? '; Secure' : ''}`);

function staff(req, res, next) {
  if (req.query.k && safeEqual(req.query.k, staffKey())) {
    setCookie(res, 'mesa_staff', signToken('mesa_staff', {}, 7 * 86400), 7 * 86400);
    return next();
  }
  if (verifyToken(cookies(req).mesa_staff, 'mesa_staff')) return next();
  return req.path.startsWith('/api/') ? res.status(401).json({ error: 'staff_required' }) : res.status(401).send(page('Acceso del personal', '<main class="narrow"><h1>🔒 Acceso del personal</h1><p>Abre la liga con la llave del comedor.</p></main>'));
}

const employeeId = (req) => verifyToken(cookies(req).mesa_emp, 'mesa_emp')?.e || null;
function employee(req, res, next) {
  req.employeeId = employeeId(req);
  return req.employeeId ? next() : res.status(401).json({ error: 'login_required' });
}

// Páginas: plantilla con versión en las URLs (Cloudflare no sirve CSS/JS viejos).
const version = crypto.createHash('sha1').update(fs.readdirSync(pub).filter((f) => /\.(js|css)$/.test(f)).sort().map((f) => fs.readFileSync(path.join(pub, f))).join('')).digest('hex').slice(0, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function page(title, body, { script = null, bodyClass = '' } = {}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><base href="${publicUrl('mesa', '/')}">
<link rel="icon" href="assets/mesa-mark.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap">
<link rel="stylesheet" href="assets/mesa.css?v=${version}"></head>
<body class="${bodyClass}">${body}${script ? `<script type="module" src="assets/${script}?v=${version}"></script>` : ''}</body></html>`;
}
const file = (f) => fs.readFileSync(path.join(pub, f), 'utf8');

r.use('/assets', express.static(pub, { maxAge: '1h', index: false }));
r.use(express.json({ limit: '200kb' }));

// --- Páginas -----------------------------------------------------------------------------
r.get('/', (req, res) => {
  const k = encodeURIComponent(staffKey());
  const links = { APP: 'app', KIOSK: `kiosco?k=${k}`, KITCHEN: `cocina?k=${k}`, PASS: `pase?k=${k}`, PICKUP: `pase?modo=salida&k=${k}` };
  res.set('Cache-Control', 'no-cache').send(page('Vamo Mesa · Comedores corporativos', file('landing.html').replace(/\{\{(\w+)\}\}/g, (m, key) => esc(links[key] ?? m)), { script: 'landing.js', bodyClass: 'landing' }));
});
r.get('/app', (req, res) => res.send(page('Vamo Mesa · Mi comedor', '<div id="app"></div>', { script: 'app.js', bodyClass: 'portal' })));
r.get('/kiosco', staff, (req, res) => res.send(page('Vamo Mesa · Kiosco', '<div id="app"></div>', { script: 'kiosk.js', bodyClass: 'kiosk' })));
r.get('/cocina', staff, (req, res) => res.send(page('Vamo Mesa · Cocina', '<div id="app"></div>', { script: 'cocina.js', bodyClass: 'manager' })));
r.get('/pase', staff, (req, res) => res.send(page('Vamo Mesa · Pase', '<div id="app"></div>', { script: 'pase.js', bodyClass: `pass ${req.query.modo === 'salida' ? 'pickup' : ''}` })));
r.get('/encuesta/:id', (req, res) => res.send(page('Vamo Mesa · ¿Qué tal tu comida?', `<div id="app" data-id="${esc(req.params.id)}"></div>`, { script: 'encuesta.js', bodyClass: 'portal' })));

// Ticket de 80 mm para impresora térmica (se imprime con el diálogo del navegador).
r.get('/ticket/:id', staff, (req, res) => {
  const o = mesa.getOrder(req.params.id);
  if (!o) return res.status(404).send('Not found');
  mesa.markPrinted(o.id);
  const t = new Date(o.created_at).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${esc(o.code)}</title>
<style>@page { size: 80mm auto; margin: 3mm; } body { font: 13px/1.35 ui-monospace, Menlo, Consolas, monospace; width: 74mm; margin: 0 auto; color: #000; }
h1 { font-size: 34px; text-align: center; margin: 4px 0; letter-spacing: 4px; } .c { text-align: center; } hr { border: 0; border-top: 1px dashed #000; }
table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; vertical-align: top; } td.r { text-align: right; white-space: nowrap; }</style></head>
<body onload="window.print()"><p class="c"><b>VAMO MESA</b><br>Comedor corporativo</p><hr>
<h1>${esc(o.code)}</h1><p class="c">${esc(o.channel === 'web' ? 'PRECOMPRA WEB' : 'KIOSCO')} · ${t}${o.pickup ? ` · recoge ${esc(o.pickup)}` : ''}</p><hr>
<table>${o.items.map((i) => `<tr><td>${i.qty} × ${esc(i.name)}</td><td class="r">$${(i.qty * i.price_mxn).toFixed(2)}</td></tr>`).join('')}</table><hr>
<table><tr><td>Total</td><td class="r"><b>$${o.total.toFixed(2)}</b></td></tr>${o.benefit_used ? `<tr><td>Beneficio</td><td class="r">-$${o.benefit_used.toFixed(2)}</td></tr>` : ''}
<tr><td>Tarjeta</td><td class="r">$${o.card_paid.toFixed(2)}</td></tr></table><hr>
<p class="c">${esc(o.employee ? `${o.employee.name} · ${o.employee.area ?? ''}` : 'Cliente de mostrador')}</p></body></html>`);
});

// --- API pública del comedor -------------------------------------------------------------
r.get('/api/week', (req, res) => {
  const dates = mesa.weekDates(req.query.from || mesa.today());
  res.json({ today: mesa.today(), days: dates.map((date) => ({ date, items: mesa.menuFor(date) })) });
});

r.post('/api/login', rateLimit({ windowMs: 10 * 60_000, max: 20 }), (req, res) => {
  const e = mesa.login(req.body?.number, req.body?.pin);
  if (!e) return res.status(401).json({ error: 'invalid_credentials' });
  setCookie(res, 'mesa_emp', signToken('mesa_emp', { e: e.id }, 12 * 3600), 12 * 3600);
  res.json({ employee: e });
});
r.post('/api/logout', (req, res) => { setCookie(res, 'mesa_emp', '', 0); res.json({ ok: true }); });
r.get('/api/me', employee, (req, res) => {
  const e = mesa.getEmployee(req.employeeId);
  const orders = mesa.weekDates(mesa.today()).flatMap((date) => mesa.listOrders({ date, employeeId: e.id }));
  res.json({ employee: e, orders });
});

// Precompra desde el portal (hoy o cualquier día de la semana con menú).
r.post('/api/orders', employee, wrap(async (req, res) => {
  const o = mesa.placeOrder({ employeeId: req.employeeId, lines: req.body.lines, pay: req.body.pay === 'card' ? 'card' : 'benefit', channel: 'web', date: req.body.date || mesa.today(), pickup: req.body.pickup || null });
  res.status(201).json({ order: o, employee: mesa.getEmployee(req.employeeId) });
}));
r.post('/api/orders/:id/cancel', employee, wrap(async (req, res) => {
  const o = mesa.getOrder(req.params.id);
  if (!o || o.employee_id !== req.employeeId) return res.status(404).json({ error: 'order_not_found' });
  if (o.status !== 'paid') return res.status(409).json({ error: 'cannot_cancel' });
  res.json({ order: await mesa.advanceOrder(o.id, 'cancelled'), employee: mesa.getEmployee(req.employeeId) });
}));

r.get('/api/survey/:id', (req, res) => {
  const s = mesa.getSurvey(req.params.id);
  if (!s) return res.status(404).json({ error: 'survey_not_found' });
  res.json({ answered: Boolean(s.answered_at), items: s.order.items.map((i) => ({ name: i.name, emoji: i.emoji })), date: s.order.date, name: s.order.employee?.name?.split(' ')[0] ?? null });
});
r.post('/api/survey/:id', rateLimit({ windowMs: 10 * 60_000, max: 20 }), (req, res) => {
  mesa.answerSurvey(req.params.id, req.body || {});
  res.json({ ok: true });
});

// --- API del personal --------------------------------------------------------------------
r.use('/api/staff', staff);

// Venta en kiosco: con número de empleado + NIP se usa su beneficio; si no, tarjeta.
r.post('/api/staff/kiosk/orders', rateLimit({ windowMs: 60_000, max: 60 }), wrap(async (req, res) => {
  let emp = null;
  if (req.body.number) {
    emp = mesa.login(req.body.number, req.body.pin);
    if (!emp) return res.status(401).json({ error: 'invalid_credentials' });
  }
  const o = mesa.placeOrder({ employeeId: emp?.id ?? null, lines: req.body.lines, pay: emp && req.body.pay !== 'card' ? 'benefit' : 'card', channel: 'kiosk' });
  res.status(201).json({ order: o, employee: emp ? mesa.getEmployee(emp.id) : null });
}));

r.get('/api/staff/orders', (req, res) => {
  const statuses = req.query.status ? String(req.query.status).split(',') : null;
  res.json(mesa.listOrders({ date: req.query.date || mesa.today(), statuses }));
});
r.post('/api/staff/orders/:id/advance', wrap(async (req, res) => res.json(await mesa.advanceOrder(req.params.id, req.body?.to || null))));

r.get('/api/staff/items', (req, res) => res.json(mesa.listItems()));
r.post('/api/staff/items', (req, res) => res.status(201).json(mesa.upsertItem(req.body || {})));
r.post('/api/staff/menu', (req, res) => {
  mesa.setMenu(req.body.date, req.body.item_id, req.body.planned_qty);
  res.json(mesa.menuFor(req.body.date));
});
r.post('/api/staff/menu/csv', express.text({ type: '*/*', limit: '500kb' }), (req, res) => res.json(mesa.importMenuCsv(typeof req.body === 'string' ? req.body : req.body?.csv || '')));

r.get('/api/staff/inventory', (req, res) => res.json(mesa.listIngredients()));
r.post('/api/staff/inventory/:id/move', (req, res) => {
  const reason = ['entrada', 'merma', 'ajuste'].includes(req.body?.reason) ? req.body.reason : 'ajuste';
  const qty = Number(req.body?.qty);
  if (!Number.isFinite(qty) || qty === 0) return res.status(400).json({ error: 'invalid_qty' });
  mesa.moveStock(req.params.id, reason === 'merma' ? -Math.abs(qty) : reason === 'entrada' ? Math.abs(qty) : qty, reason);
  res.json(mesa.listIngredients());
});

r.get('/api/staff/kpis', (req, res) => res.json(mesa.kpis(req.query.from || mesa.today(), req.query.to || req.query.from || mesa.today())));
r.get('/api/staff/report/:kind', (req, res) => {
  const from = req.query.from || mesa.today(-6);
  const to = req.query.to || mesa.today();
  const rows = mesa.report(req.params.kind, from, to);
  if (req.query.format === 'csv') {
    return res.type('text/csv; charset=utf-8').attachment(`vamo-mesa-${req.params.kind}-${from}_${to}.csv`).send('﻿' + mesa.toCsv(rows));
  }
  res.json(rows);
});
r.get('/api/staff/outbox', (req, res) => res.json(mesa.outbox()));

r.use((err, req, res, _next) => {
  if (!err.status) console.error('[mesa]', err);
  res.status(err.status || 500).json({ error: err.message, details: err.details });
});

export default r;
