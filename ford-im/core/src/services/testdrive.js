// Pruebas de manejo: horarios por distribuidor (dealers.json → test_drive), reservas con cupo
// por horario, confirmación por WhatsApp con liga a Google Calendar y recordatorio un día antes.
import { getDb, now, uid, logEvent } from '../db.js';
import { config } from '../config.js';
import { dealers, getDealer, getVehicle } from '../data/catalog.js';
import { loc } from '../lib/i18n.js';
import { getSession, updateSession } from './sessions.js';
import * as wa from './whatsapp.js';

const db = () => getDb();
const HOUR = 3_600_000;

const DEFAULTS = { timezone_offset: '-06:00', days: [1, 2, 3, 4, 5, 6], open: '10:00', close: '18:00', slot_minutes: 60, capacity_per_slot: 2, min_notice_hours: 2, days_ahead: 10 };
const settings = (dealer) => ({ ...DEFAULTS, ...(dealer?.test_drive || {}) });
const offsetMs = (off) => { const [, sign, h, m] = off.match(/([+-])(\d{2}):(\d{2})/); return (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m)) * 60_000; };

// Fecha/hora local del distribuidor ↔ epoch ms.
export function localToEpoch(dateStr, timeStr, off) {
  return Date.parse(`${dateStr}T${timeStr}:00Z`) - offsetMs(off);
}
export function epochToLocal(ms, off) {
  const d = new Date(ms + offsetMs(off));
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), weekday: d.getUTCDay() };
}

function booked(dealerId, from, to) {
  const rows = db().prepare("SELECT starts_at, COUNT(*) n FROM test_drives WHERE dealer_id = ? AND status = 'booked' AND starts_at BETWEEN ? AND ? GROUP BY starts_at").all(dealerId, from, to);
  return new Map(rows.map((r) => [r.starts_at, r.n]));
}

export function availableSlots(dealerId, { date = null, limit = 12, at = now() } = {}) {
  const dealer = getDealer(dealerId);
  if (!dealer) throw Object.assign(new Error('unknown_dealer'), { status: 404 });
  const s = settings(dealer);
  const earliest = at + s.min_notice_hours * HOUR;
  const out = [];
  const taken = booked(dealerId, at, at + (s.days_ahead + 1) * 24 * HOUR);
  const startDay = date || epochToLocal(at, s.timezone_offset).date;
  for (let i = 0; i <= s.days_ahead && out.length < limit; i++) {
    const day = new Date(Date.parse(`${startDay}T00:00:00Z`) + i * 24 * HOUR).toISOString().slice(0, 10);
    if (date && day !== date) break;
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (!s.days.includes(weekday)) continue;
    const open = localToEpoch(day, s.open, s.timezone_offset);
    const close = localToEpoch(day, s.close, s.timezone_offset);
    for (let t = open; t + s.slot_minutes * 60_000 <= close && out.length < limit; t += s.slot_minutes * 60_000) {
      if (t < earliest) continue;
      const left = s.capacity_per_slot - (taken.get(t) || 0);
      if (left > 0) out.push({ starts_at: t, local: epochToLocal(t, s.timezone_offset), spots_left: left });
    }
  }
  return out;
}

function gcalLink({ title, start, minutes, details, location }) {
  const fmt = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${fmt(start)}/${fmt(start + minutes * 60_000)}`, details, location });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const fmtLocal = (ms, off, lang) => {
  const d = new Date(ms + offsetMs(off));
  return d.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

export function describe(td, lang) {
  const dealer = getDealer(td.dealer_id);
  const vehicle = getVehicle(td.vehicle_id);
  const s = settings(dealer);
  const vName = vehicle ? loc(vehicle.name, lang) : 'Ford';
  return {
    id: td.id, status: td.status, starts_at: td.starts_at, vehicle: vName, dealer: dealer?.name,
    when: fmtLocal(td.starts_at, s.timezone_offset, lang),
    calendar_url: gcalLink({
      title: lang === 'en' ? `Test drive – ${vName}` : `Prueba de manejo – ${vName}`,
      start: td.starts_at, minutes: s.slot_minutes,
      details: lang === 'en' ? 'Bring your driver\'s license.' : 'Trae tu licencia de manejo vigente.',
      location: `${dealer?.name ?? ''}, ${dealer?.address ?? ''}`,
    }),
  };
}

export function bookTestDrive(sessionId, startsAt) {
  const session = getSession(sessionId);
  if (!session) throw Object.assign(new Error('session_not_found'), { status: 404 });
  // Sesiones sin kiosco (escribieron sin escanear) usan el distribuidor principal.
  const dealer = getDealer(session.dealer_id) || dealers[0];
  if (!dealer) throw Object.assign(new Error('session_without_dealer'), { status: 409 });
  if (!session.vehicle_id) throw Object.assign(new Error('vehicle_required'), { status: 409 });
  const ts = Number(startsAt);
  const slot = availableSlots(dealer.id, { date: epochToLocal(ts, settings(dealer).timezone_offset).date, limit: 100 }).find((x) => x.starts_at === ts);
  if (!slot) throw Object.assign(new Error('slot_not_available'), { status: 409, details: { alternatives: availableSlots(dealer.id, { limit: 6 }) } });

  // Una sola prueba activa por cliente: si ya tenía una, se reprograma.
  db().prepare("UPDATE test_drives SET status = 'rescheduled', updated_at = ? WHERE session_id = ? AND status = 'booked'").run(now(), sessionId);
  const id = uid('td_');
  const t = now();
  db().prepare('INSERT INTO test_drives (id, session_id, dealer_id, vehicle_id, starts_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, sessionId, dealer.id, session.vehicle_id, ts, t, t);
  logEvent('test_drive_booked', { sessionId, data: { starts_at: ts } });
  if (['scanned', 'chatting'].includes(session.stage)) updateSession(sessionId, { stage: 'test_drive_booked' });
  return getTestDrive(id);
}

export const getTestDrive = (id) => db().prepare('SELECT * FROM test_drives WHERE id = ?').get(id) || null;
export const activeTestDrive = (sessionId) =>
  db().prepare("SELECT * FROM test_drives WHERE session_id = ? AND status = 'booked' ORDER BY starts_at DESC LIMIT 1").get(sessionId) || null;

export const latestTestDrive = (sessionId) =>
  db().prepare("SELECT * FROM test_drives WHERE session_id = ? AND status != 'rescheduled' ORDER BY created_at DESC LIMIT 1").get(sessionId) || null;

export function setTestDriveStatus(id, status) {
  if (!['booked', 'cancelled', 'done', 'no_show'].includes(status)) throw Object.assign(new Error('invalid_status'), { status: 400 });
  db().prepare('UPDATE test_drives SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  const td = getTestDrive(id);
  logEvent(`test_drive_${status}`, { sessionId: td?.session_id });
  return td;
}

export function upcomingTestDrives({ from = now() - 2 * HOUR, days = 14 } = {}) {
  return db().prepare(`SELECT td.*, s.name, s.wa_id, s.lang, s.assigned_to FROM test_drives td JOIN sessions s ON s.id = td.session_id
    WHERE td.starts_at BETWEEN ? AND ? AND td.status IN ('booked','done','no_show') ORDER BY td.starts_at`).all(from, from + days * 24 * HOUR);
}

// Recordatorio ~24 h antes (plantilla aprobada, porque puede estar fuera de la ventana de 24 h).
export async function sendDueReminders(at = now()) {
  const due = db().prepare(`SELECT td.*, s.wa_id, s.lang, s.name FROM test_drives td JOIN sessions s ON s.id = td.session_id
    WHERE td.status = 'booked' AND td.reminder_sent = 0 AND td.starts_at BETWEEN ? AND ?`).all(at + 2 * HOUR, at + 26 * HOUR);
  for (const td of due) {
    const d = describe(td, td.lang);
    const text = td.lang === 'en'
      ? `⏰ Reminder: your test drive of the *${d.vehicle}* is ${d.when} at ${d.dealer}. Bring your driver's license. Reply here if you need to reschedule.`
      : `⏰ Recordatorio: tu prueba de manejo del *${d.vehicle}* es el ${d.when} en ${d.dealer}. Trae tu licencia de manejo. Si necesitas cambiar la hora, respóndenos aquí.`;
    try {
      await wa.sendText(td.wa_id, text).catch(() => wa.sendTemplate(td.wa_id, config.whatsapp.templates.testDriveReminder, td.lang, [td.name || '', d.vehicle, d.when]));
      db().prepare('UPDATE test_drives SET reminder_sent = 1 WHERE id = ?').run(td.id);
    } catch (err) {
      console.warn('[test-drive reminder]', err.message);
    }
  }
  return due.length;
}
