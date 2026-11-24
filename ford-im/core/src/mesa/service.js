// Vamo Mesa – reglas del comedor: menú por día, pedidos con beneficio o tarjeta, existencias,
// estados en cocina, encuestas de satisfacción e indicadores.
import nodemailer from 'nodemailer';
import { mdb } from './store.js';
import { now, uid, shortCode } from '../db.js';
import { config } from '../config.js';

export const CATEGORIES = ['menu', 'premium', 'grab_go'];
export const STATUSES = ['paid', 'preparing', 'ready', 'delivered', 'cancelled'];
const NEXT = { paid: 'preparing', preparing: 'ready', ready: 'delivered' };
const STAMP = { preparing: 'preparing_at', ready: 'ready_at', delivered: 'delivered_at' };
const TZ = 'America/Mexico_City';

const err = (code, status = 400, details) => Object.assign(new Error(code), { status, details });
const round = (n) => Math.round(n * 100) / 100;

/** Fecha YYYY-MM-DD en la Ciudad de México (desfase en días opcional). */
export function today(offsetDays = 0, base = Date.now()) {
  return new Date(base + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });
}
export const weekDates = (from = today()) => Array.from({ length: 7 }, (_, i) => today(i, Date.parse(`${from}T12:00:00-06:00`)));

// --- Catálogo y menú ---------------------------------------------------------------------
export const listItems = () => mdb().prepare('SELECT * FROM mesa_items WHERE active = 1 ORDER BY category, name').all();
export const getItem = (id) => mdb().prepare('SELECT * FROM mesa_items WHERE id = ?').get(id) || null;

export function upsertItem({ id, name, description = '', category, price_mxn, benefit_eligible = true, kcal = null, tags = '', emoji = '🍽️' }) {
  if (!name || !CATEGORIES.includes(category) || !(Number(price_mxn) >= 0)) throw err('invalid_item');
  const existing = id ? getItem(id) : mdb().prepare('SELECT * FROM mesa_items WHERE lower(name) = lower(?)').get(name);
  if (existing) {
    mdb().prepare('UPDATE mesa_items SET name=?, description=?, category=?, price_mxn=?, benefit_eligible=?, kcal=?, tags=?, emoji=?, active=1 WHERE id=?')
      .run(name, description, category, Number(price_mxn), benefit_eligible ? 1 : 0, kcal, tags, emoji, existing.id);
    return getItem(existing.id);
  }
  const newId = uid('it_');
  mdb().prepare('INSERT INTO mesa_items (id, name, description, category, price_mxn, benefit_eligible, kcal, tags, emoji, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(newId, name, description, category, Number(price_mxn), benefit_eligible ? 1 : 0, kcal, tags, emoji, now());
  return getItem(newId);
}

export function setMenu(date, item_id, planned_qty) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !getItem(item_id)) throw err('invalid_menu');
  const qty = Math.max(0, Math.round(Number(planned_qty) || 0));
  if (qty === 0) return mdb().prepare('DELETE FROM mesa_menu WHERE date = ? AND item_id = ?').run(date, item_id);
  mdb().prepare('INSERT INTO mesa_menu (id, date, item_id, planned_qty) VALUES (?,?,?,?) ON CONFLICT(date, item_id) DO UPDATE SET planned_qty = excluded.planned_qty')
    .run(uid('mn_'), date, item_id, qty);
}

/** Menú del día con lo vendido y lo que queda. */
export function menuFor(date) {
  return mdb().prepare(`
    SELECT i.*, m.planned_qty,
      COALESCE((SELECT SUM(oi.qty) FROM mesa_order_items oi JOIN mesa_orders o ON o.id = oi.order_id
        WHERE o.date = m.date AND oi.item_id = m.item_id AND o.status != 'cancelled'), 0) AS sold
    FROM mesa_menu m JOIN mesa_items i ON i.id = m.item_id
    WHERE m.date = ? ORDER BY CASE i.category WHEN 'menu' THEN 0 WHEN 'premium' THEN 1 ELSE 2 END, i.name`).all(date)
    .map((r) => ({ ...r, available: Math.max(0, r.planned_qty - r.sold) }));
}

/**
 * Carga de menú por CSV: fecha,platillo,categoria,precio,porciones[,descripcion,kcal]
 * (categoria: menu | premium | grab_go). Crea los platillos que no existan.
 */
export function importMenuCsv(text) {
  const rows = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = { loaded: 0, errors: [] };
  rows.forEach((line, i) => {
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    if (i === 0 && /fecha|date/i.test(cols[0])) return; // encabezado
    const [date, name, category, price, qty, description = '', kcal = ''] = cols;
    try {
      const item = upsertItem({ name, category: (category || '').toLowerCase().replace('&', '_').replace(/\s+/g, '_').replace('grab_and_go', 'grab_go'), price_mxn: price, description, kcal: kcal ? Number(kcal) : null });
      setMenu(date, item.id, qty);
      out.loaded++;
    } catch (e) { out.errors.push({ line: i + 1, error: e.message }); }
  });
  return out;
}

// --- Empleados y beneficio ---------------------------------------------------------------
export const getEmployee = (id) => mdb().prepare('SELECT id, number, name, email, area, benefit_monthly, benefit_balance FROM mesa_employees WHERE id = ?').get(id) || null;
export function login(number, pin) {
  const e = mdb().prepare('SELECT * FROM mesa_employees WHERE number = ?').get(String(number || '').trim());
  return e && e.pin === String(pin || '').trim() ? getEmployee(e.id) : null;
}

// --- Inventario --------------------------------------------------------------------------
export const listIngredients = () => mdb().prepare('SELECT * FROM mesa_ingredients ORDER BY name').all()
  .map((g) => ({ ...g, low: g.stock <= g.min_stock }));

export function moveStock(ingredient_id, delta, reason, ref = null) {
  const g = mdb().prepare('SELECT * FROM mesa_ingredients WHERE id = ?').get(ingredient_id);
  if (!g) throw err('invalid_ingredient');
  mdb().prepare('UPDATE mesa_ingredients SET stock = ROUND(stock + ?, 3) WHERE id = ?').run(delta, ingredient_id);
  mdb().prepare('INSERT INTO mesa_stock_moves (ingredient_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)').run(ingredient_id, delta, reason, ref, now());
}

function consume(orderId, lines, sign) {
  for (const { item_id, qty } of lines) {
    for (const r of mdb().prepare('SELECT * FROM mesa_recipes WHERE item_id = ?').all(item_id)) {
      moveStock(r.ingredient_id, sign * r.qty * qty, sign < 0 ? 'order' : 'cancel', orderId);
    }
  }
}

// --- Pedidos -----------------------------------------------------------------------------
/**
 * Crea un pedido del día. pay: 'benefit' (con tope en el saldo; el resto con tarjeta) o 'card'.
 * channel: 'web' (precompra en el portal) o 'kiosk'.
 */
export function placeOrder({ employeeId = null, lines, pay = 'benefit', channel = 'web', date = today(), pickup = null }) {
  const d = mdb();
  const wanted = (lines || []).map((l) => ({ item_id: l.item_id, qty: Math.round(Number(l.qty)) })).filter((l) => l.qty > 0);
  if (!wanted.length) throw err('empty_order');
  const menu = Object.fromEntries(menuFor(date).map((m) => [m.id, m]));
  let total = 0, eligible = 0;
  for (const l of wanted) {
    const m = menu[l.item_id];
    if (!m) throw err('item_not_on_menu', 409, { item_id: l.item_id });
    if (l.qty > m.available) throw err('sold_out', 409, { item_id: l.item_id, available: m.available });
    total += m.price_mxn * l.qty;
    if (m.benefit_eligible) eligible += m.price_mxn * l.qty;
  }
  const emp = employeeId ? d.prepare('SELECT * FROM mesa_employees WHERE id = ?').get(employeeId) : null;
  if (pay === 'benefit' && !emp) throw err('employee_required', 401);
  const benefit = pay === 'benefit' ? round(Math.min(emp.benefit_balance, eligible)) : 0;
  const card = round(total - benefit);

  const id = uid('ord_');
  const code = shortCode(4);
  d.exec('BEGIN');
  try {
    d.prepare('INSERT INTO mesa_orders (id, code, date, employee_id, channel, status, total, benefit_used, card_paid, pickup, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, code, date, emp?.id ?? null, channel, 'paid', round(total), benefit, card, pickup, now());
    for (const l of wanted) d.prepare('INSERT INTO mesa_order_items (order_id, item_id, qty, price_mxn) VALUES (?,?,?,?)').run(id, l.item_id, l.qty, menu[l.item_id].price_mxn);
    if (benefit) d.prepare('UPDATE mesa_employees SET benefit_balance = ROUND(benefit_balance - ?, 2) WHERE id = ?').run(benefit, emp.id);
    consume(id, wanted, -1);
    d.exec('COMMIT');
  } catch (e) { d.exec('ROLLBACK'); throw e; }
  return getOrder(id);
}

export function getOrder(id) {
  const o = mdb().prepare('SELECT * FROM mesa_orders WHERE id = ?').get(id);
  if (!o) return null;
  const items = mdb().prepare('SELECT oi.item_id, oi.qty, oi.price_mxn, i.name, i.emoji, i.category FROM mesa_order_items oi JOIN mesa_items i ON i.id = oi.item_id WHERE oi.order_id = ?').all(id);
  const emp = o.employee_id ? getEmployee(o.employee_id) : null;
  return { ...o, items, employee: emp ? { name: emp.name, number: emp.number, area: emp.area } : null };
}

export function listOrders({ date = today(), statuses = null, employeeId = null } = {}) {
  const where = ['date = ?'];
  const args = [date];
  if (statuses) { where.push(`status IN (${statuses.map(() => '?').join(',')})`); args.push(...statuses); }
  if (employeeId) { where.push('employee_id = ?'); args.push(employeeId); }
  return mdb().prepare(`SELECT id FROM mesa_orders WHERE ${where.join(' AND ')} ORDER BY created_at`).all(...args).map((r) => getOrder(r.id));
}

/** Avanza el pedido (o lo lleva a `to`). Al entregarse, manda la encuesta de satisfacción. */
export async function advanceOrder(id, to = null) {
  const o = getOrder(id);
  if (!o) throw err('order_not_found', 404);
  const target = to || NEXT[o.status];
  if (target === 'cancelled') {
    if (!['paid', 'preparing'].includes(o.status)) throw err('cannot_cancel', 409);
    const d = mdb();
    d.exec('BEGIN');
    try {
      d.prepare("UPDATE mesa_orders SET status = 'cancelled' WHERE id = ?").run(id);
      if (o.benefit_used && o.employee_id) d.prepare('UPDATE mesa_employees SET benefit_balance = ROUND(benefit_balance + ?, 2) WHERE id = ?').run(o.benefit_used, o.employee_id);
      consume(id, o.items, +1);
      d.exec('COMMIT');
    } catch (e) { d.exec('ROLLBACK'); throw e; }
    return getOrder(id);
  }
  if (!target || STATUSES.indexOf(target) <= STATUSES.indexOf(o.status) || o.status === 'cancelled') throw err('invalid_transition', 409);
  const t = now();
  const sets = ['status = ?'];
  const args = [target];
  for (const s of ['preparing', 'ready', 'delivered']) {
    if (STATUSES.indexOf(s) <= STATUSES.indexOf(target) && !o[STAMP[s]]) { sets.push(`${STAMP[s]} = ?`); args.push(t); }
  }
  mdb().prepare(`UPDATE mesa_orders SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
  if (target === 'delivered') await sendSurvey(id).catch((e) => console.warn('[mesa] encuesta', e.message));
  return getOrder(id);
}

export const markPrinted = (id) => mdb().prepare('UPDATE mesa_orders SET printed_at = ? WHERE id = ?').run(now(), id);

// --- Encuestas de satisfacción -----------------------------------------------------------
let transport;
const mailer = () => (transport ??= config.mail.smtpUrl ? nodemailer.createTransport(config.mail.smtpUrl) : nodemailer.createTransport({ jsonTransport: true }));

export async function sendSurvey(orderId, { baseUrl = surveyBase } = {}) {
  const o = getOrder(orderId);
  if (!o?.employee_id) return null;
  const emp = getEmployee(o.employee_id);
  const existing = mdb().prepare('SELECT * FROM mesa_surveys WHERE order_id = ?').get(orderId);
  if (existing) return existing;
  const id = uid('sv_');
  mdb().prepare('INSERT INTO mesa_surveys (id, order_id, employee_id, sent_at) VALUES (?,?,?,?)').run(id, orderId, emp.id, now());
  if (!emp.email) return { id };
  const url = `${baseUrl()}/encuesta/${id}`;
  const dishes = o.items.map((i) => `${i.emoji} ${i.name}`).join(', ');
  const subject = `¿Qué tal tu comida de hoy? (${o.items[0]?.name ?? 'comedor'})`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
    <h2 style="margin:0 0 8px">Hola ${emp.name.split(' ')[0]} 👋</h2>
    <p>Hoy comiste: <b>${dishes}</b>.</p>
    <p>¿Nos ayudas con 30 segundos? Cuéntanos qué te gustó, qué no y qué podemos mejorar.</p>
    <p style="margin:24px 0"><a href="${url}" style="background:#0f766e;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700">Calificar mi comida</a></p>
    <p style="color:#667;font-size:13px">Vamo Mesa · Comedor corporativo</p></div>`;
  const info = await mailer().sendMail({ from: process.env.MESA_MAIL_FROM || 'Vamo Mesa <comedor@menteia.com>', to: emp.email, subject, html });
  mdb().prepare('INSERT INTO mesa_outbox (to_email, subject, html, delivered, created_at) VALUES (?,?,?,?,?)')
    .run(emp.email, subject, html, config.mail.smtpUrl && info.accepted?.length ? 1 : 0, now());
  return { id, url };
}
let surveyBase = () => '';
export const setSurveyBase = (fn) => { surveyBase = fn; };

export function getSurvey(id) {
  const s = mdb().prepare('SELECT * FROM mesa_surveys WHERE id = ?').get(id);
  return s ? { ...s, order: getOrder(s.order_id) } : null;
}

export function answerSurvey(id, { rating, liked = [], disliked = '', improve = '' }) {
  const s = getSurvey(id);
  if (!s) throw err('survey_not_found', 404);
  if (s.answered_at) throw err('already_answered', 409);
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) throw err('invalid_rating');
  const tags = (Array.isArray(liked) ? liked : String(liked).split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 8).join(',');
  mdb().prepare('UPDATE mesa_surveys SET rating=?, liked=?, disliked=?, improve=?, answered_at=? WHERE id=?')
    .run(r, tags, String(disliked).slice(0, 600), String(improve).slice(0, 600), now(), id);
  return getSurvey(id);
}

// Correos de encuesta enviados (sin SMTP configurado sólo quedan aquí, con su liga para el demo).
export const outbox = (limit = 30) => mdb().prepare('SELECT id, to_email, subject, html, delivered, created_at FROM mesa_outbox ORDER BY id DESC LIMIT ?').all(limit)
  .map(({ html, ...m }) => ({ ...m, url: html.match(/href="([^"]+\/encuesta\/[^"]+)"/)?.[1] ?? null }));

// --- Indicadores y reportes --------------------------------------------------------------
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const minutes = (ms) => (ms == null ? null : Math.round((ms / 60_000) * 10) / 10);

/** Indicadores de gestión para un rango de fechas (inclusive). */
export function kpis(from = today(), to = from) {
  const d = mdb();
  const orders = d.prepare("SELECT * FROM mesa_orders WHERE date BETWEEN ? AND ? AND status != 'cancelled'").all(from, to);
  const ids = orders.map((o) => o.id);
  const lines = ids.length ? d.prepare(`SELECT oi.*, i.name, i.category FROM mesa_order_items oi JOIN mesa_items i ON i.id = oi.item_id WHERE oi.order_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  const planned = d.prepare('SELECT COALESCE(SUM(planned_qty),0) n FROM mesa_menu WHERE date BETWEEN ? AND ?').get(from, to).n;
  const plannedCost = d.prepare(`SELECT COALESCE(SUM(m.planned_qty * (SELECT COALESCE(SUM(r.qty * g.unit_cost),0) FROM mesa_recipes r JOIN mesa_ingredients g ON g.id = r.ingredient_id WHERE r.item_id = m.item_id)),0) c
    FROM mesa_menu m WHERE m.date BETWEEN ? AND ?`).get(from, to).c;
  const portions = lines.reduce((a, l) => a + l.qty, 0);
  const revenue = orders.reduce((a, o) => a + o.total, 0);
  const benefit = orders.reduce((a, o) => a + o.benefit_used, 0);
  const prep = orders.filter((o) => o.ready_at).map((o) => o.ready_at - o.created_at);
  const floor = orders.filter((o) => o.delivered_at && o.ready_at).map((o) => o.delivered_at - o.ready_at);
  const surveys = d.prepare(`SELECT s.* FROM mesa_surveys s JOIN mesa_orders o ON o.id = s.order_id WHERE o.date BETWEEN ? AND ?`).all(from, to);
  const answered = surveys.filter((s) => s.answered_at);
  const byItem = {};
  for (const l of lines) {
    const k = (byItem[l.item_id] ??= { item_id: l.item_id, name: l.name, category: l.category, qty: 0, revenue: 0 });
    k.qty += l.qty; k.revenue += l.qty * l.price_mxn;
  }
  const byHour = Array(24).fill(0);
  for (const o of orders) byHour[Number(new Date(o.created_at).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24]++;
  const leftovers = Math.max(0, planned - portions);
  return {
    from, to,
    orders: orders.length,
    portions,
    planned,
    sell_through: planned ? Math.round((portions / planned) * 1000) / 10 : null,
    leftovers,
    leftover_cost_mxn: planned ? Math.round((plannedCost / planned) * leftovers) : 0,
    revenue_mxn: Math.round(revenue),
    benefit_mxn: Math.round(benefit),
    card_mxn: Math.round(revenue - benefit),
    benefit_share: revenue ? Math.round((benefit / revenue) * 1000) / 10 : null,
    avg_ticket_mxn: orders.length ? Math.round(revenue / orders.length) : null,
    preorder_share: orders.length ? Math.round((orders.filter((o) => o.channel === 'web').length / orders.length) * 1000) / 10 : null,
    avg_prep_min: minutes(avg(prep)),
    avg_floor_min: minutes(avg(floor)),
    pending_now: d.prepare("SELECT COUNT(*) n FROM mesa_orders WHERE date = ? AND status IN ('paid','preparing','ready')").get(today()).n,
    csat: answered.length ? Math.round(avg(answered.map((s) => s.rating)) * 10) / 10 : null,
    csat_pct: answered.length ? Math.round((answered.filter((s) => s.rating >= 4).length / answered.length) * 1000) / 10 : null,
    survey_response_rate: surveys.length ? Math.round((answered.length / surveys.length) * 1000) / 10 : null,
    low_stock: listIngredients().filter((g) => g.low).length,
    top_items: Object.values(byItem).sort((a, b) => b.qty - a.qty).slice(0, 8),
    by_hour: byHour.map((n, h) => ({ h, n })).filter((x) => x.h >= 7 && x.h <= 18),
  };
}

/** Reportes en filas planas (también exportables a CSV). */
export function report(kind, from, to) {
  const d = mdb();
  if (kind === 'platillos') {
    return d.prepare(`SELECT i.name AS platillo, i.category AS categoria, SUM(oi.qty) AS porciones, ROUND(SUM(oi.qty * oi.price_mxn)) AS ingreso_mxn,
        ROUND(AVG(s.rating), 1) AS calificacion
      FROM mesa_order_items oi JOIN mesa_orders o ON o.id = oi.order_id JOIN mesa_items i ON i.id = oi.item_id
      LEFT JOIN mesa_surveys s ON s.order_id = o.id AND s.answered_at IS NOT NULL
      WHERE o.date BETWEEN ? AND ? AND o.status != 'cancelled' GROUP BY i.id ORDER BY porciones DESC`).all(from, to);
  }
  if (kind === 'tiempos') {
    return d.prepare(`SELECT o.date AS fecha, o.code AS pedido, o.channel AS canal, o.status AS estado,
        ROUND((o.ready_at - o.created_at) / 60000.0, 1) AS preparacion_min,
        ROUND((o.delivered_at - o.ready_at) / 60000.0, 1) AS tiempo_en_piso_min,
        ROUND((o.delivered_at - o.created_at) / 60000.0, 1) AS total_min
      FROM mesa_orders o WHERE o.date BETWEEN ? AND ? AND o.status != 'cancelled' ORDER BY o.created_at`).all(from, to);
  }
  if (kind === 'satisfaccion') {
    return d.prepare(`SELECT o.date AS fecha, e.area, s.rating AS calificacion, s.liked AS le_gusto, s.disliked AS no_le_gusto, s.improve AS mejorar
      FROM mesa_surveys s JOIN mesa_orders o ON o.id = s.order_id LEFT JOIN mesa_employees e ON e.id = s.employee_id
      WHERE o.date BETWEEN ? AND ? AND s.answered_at IS NOT NULL ORDER BY s.answered_at DESC`).all(from, to);
  }
  if (kind === 'inventario') {
    return d.prepare(`SELECT g.name AS insumo, g.unit AS unidad, ROUND(SUM(CASE WHEN m.delta < 0 THEN -m.delta ELSE 0 END), 2) AS consumo,
        ROUND(SUM(CASE WHEN m.delta > 0 AND m.reason = 'entrada' THEN m.delta ELSE 0 END), 2) AS entradas,
        ROUND(SUM(CASE WHEN m.reason = 'merma' THEN -m.delta ELSE 0 END), 2) AS merma, g.stock AS existencia, g.min_stock AS minimo
      FROM mesa_ingredients g LEFT JOIN mesa_stock_moves m ON m.ingredient_id = g.id
        AND date(m.created_at / 1000, 'unixepoch', '-6 hours') BETWEEN ? AND ?
      GROUP BY g.id ORDER BY g.name`).all(from, to);
  }
  throw err('invalid_report');
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}
