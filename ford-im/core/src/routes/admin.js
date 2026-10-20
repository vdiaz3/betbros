// Métricas del funnel (api.menteia.com/admin/metrics). Auth: Bearer ADMIN_API_KEY.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAdmin, rateLimit } from '../lib/auth.js';
import { safeEqual } from '../lib/token.js';
import { page, esc } from '../lib/html.js';
import { config, SECRETS_FILE } from '../config.js';
import { getDb } from '../db.js';

const r = express.Router();
const FUNNEL = ['qr_scanned', 'chat_started', 'greeting_sent', 'consent_credit_privacy', 'kyc_submitted', 'credit_started', 'stage_signing', 'sent_to_bank', 'stage_bank_approved'];

r.get('/metrics', requireAdmin, (req, res) => {
  const since = Number(req.query.since || Date.now() - 30 * 86_400_000);
  const db = getDb();
  const counts = Object.fromEntries(db.prepare('SELECT type, COUNT(*) n FROM events WHERE created_at >= ? GROUP BY type').all(since).map((x) => [x.type, x.n]));
  const byKiosk = db.prepare("SELECT kiosk_id, COUNT(*) scans FROM events WHERE type = 'qr_scanned' AND created_at >= ? GROUP BY kiosk_id").all(since);
  const byVehicle = db.prepare("SELECT vehicle_id, COUNT(*) leads FROM sessions WHERE wa_id IS NOT NULL AND created_at >= ? GROUP BY vehicle_id").all(since);
  const lastHeartbeat = db.prepare("SELECT kiosk_id, MAX(created_at) at FROM events WHERE type = 'kiosk_heartbeat' GROUP BY kiosk_id").all();
  res.json({ since, funnel: FUNNEL.map((k) => ({ step: k, count: counts[k] || 0 })), counts, byKiosk, byVehicle, lastHeartbeat });
});
// ---------------------------------------------------------------------------------------------
// Bóveda de credenciales: /admin/secrets. Se pegan aquí (HTTPS, en tu servidor) en lugar del chat.
// Requiere ADMIN_API_KEY. Sólo variables de la lista; los valores nunca se muestran de vuelta.
const SECRET_NAMES = [
  'N8N_BASE_URL', 'N8N_API_TOKEN',
  'WA_PHONE_NUMBER_ID', 'WA_ACCESS_TOKEN', 'WA_DISPLAY_NUMBER',
  'ELEVENLABS_API_KEY', 'ELEVENLABS_KIOSK_AGENT_ID', 'ELEVENLABS_VOICE_ES', 'ELEVENLABS_VOICE_EN',
  'DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID', 'DOCUSIGN_ACCOUNT_ID', 'DOCUSIGN_PRIVATE_KEY_B64', 'DOCUSIGN_CONNECT_HMAC_KEY', 'DOCUSIGN_AUTH_SERVER',
  'SMTP_URL', 'MAIL_FROM', 'BANK_EMAIL_OVERRIDE',
  'SHEET_VEHICLES_CSV', 'SHEET_PRICES_CSV', 'SHEET_PROMOS_CSV',
];

const readSecrets = () => {
  try {
    return Object.fromEntries(fs.readFileSync(SECRETS_FILE, 'utf8').split('\n')
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], JSON.parse(m[2])]));
  } catch { return {}; }
};

const secretsForm = (msg = '', error = false) => page({
  title: 'Ford IM · Credenciales',
  body: `<div class="card"><h1>🔐 Credenciales del servidor</h1>
  <p>Se guardan cifradas en tránsito (HTTPS) directamente en este servidor; no se muestran de vuelta.
  Después de guardar, el servicio se reinicia solo (≈3 s).</p>
  ${msg ? `<p class="${error ? 'error' : ''}"><b>${esc(msg)}</b></p>` : ''}
  <form method="post" autocomplete="off">
    <label>Llave de administrador (ADMIN_API_KEY)<input name="admin_key" type="password" required></label>
    <label>Variable<select name="name">${SECRET_NAMES.map((n) => `<option>${n}</option>`).join('')}</select></label>
    <label>Valor<textarea name="value" rows="3" required spellcheck="false"></textarea></label>
    <button class="btn">Guardar y reiniciar</button>
  </form></div>`,
});

r.get('/secrets', (req, res) => res.set('Cache-Control', 'no-store').send(secretsForm()));
r.post('/secrets', rateLimit({ windowMs: 15 * 60_000, max: 20 }), express.urlencoded({ extended: false, limit: '64kb' }), (req, res) => {
  if (!safeEqual(req.body.admin_key, config.adminApiKey)) return res.status(401).send(secretsForm('Llave de administrador incorrecta.', true));
  const name = String(req.body.name || '');
  const value = String(req.body.value || '').trim();
  if (!SECRET_NAMES.includes(name) || !value) return res.status(400).send(secretsForm('Variable o valor inválido.', true));
  const all = { ...readSecrets(), [name]: value };
  fs.writeFileSync(SECRETS_FILE, Object.entries(all).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { mode: 0o600 });
  getDb().prepare('INSERT INTO events (type, data_json, created_at) VALUES (?,?,?)').run('secret_set', JSON.stringify({ name }), Date.now());
  res.send(secretsForm(`✅ ${name} guardada. Reiniciando el servicio…`));
  // Docker (restart: unless-stopped) vuelve a levantar el proceso con la nueva configuración.
  setTimeout(() => process.exit(0), 800);
});
// Qué variables están configuradas (sin valores).
r.get('/secrets/status', requireAdmin, (req, res) => {
  const saved = Object.keys(readSecrets());
  res.json(Object.fromEntries(SECRET_NAMES.map((n) => [n, saved.includes(n) ? 'secrets.env' : process.env[n] ? '.env' : null])));
});

// ---------------------------------------------------------------------------------------------
// n8n (con la llave guardada en el servidor): leer un workflow e importar el del agente.
const n8n = async (p, opts = {}) => {
  const base = (process.env.N8N_BASE_URL || '').replace(/\/$/, '');
  if (!base || !process.env.N8N_API_TOKEN) throw Object.assign(new Error('n8n_not_configured'), { status: 503 });
  const res = await fetch(`${base}/api/v1${p}`, { ...opts, headers: { 'X-N8N-API-KEY': process.env.N8N_API_TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`n8n ${res.status}: ${JSON.stringify(json).slice(0, 300)}`), { status: 502 });
  return json;
};
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status || 500).json({ error: err.message }));

r.get('/n8n/workflows', requireAdmin, wrap(async (req, res) => {
  const list = await n8n('/workflows?limit=250');
  res.json(list.data.map(({ id, name, active, updatedAt }) => ({ id, name, active, updatedAt })));
}));
r.get('/n8n/workflows/:id', requireAdmin, wrap(async (req, res) => res.json(await n8n(`/workflows/${encodeURIComponent(req.params.id)}`))));
r.get('/n8n/credentials-in-use', requireAdmin, wrap(async (req, res) => {
  // Lista las credenciales (nombre y tipo) referenciadas por los workflows; nunca sus secretos.
  const list = await n8n('/workflows?limit=250');
  const seen = new Map();
  for (const w of list.data) for (const node of w.nodes || []) for (const [type, c] of Object.entries(node.credentials || {})) seen.set(`${type}:${c.id}`, { type, id: c.id, name: c.name, workflow: w.name });
  res.json([...seen.values()]);
}));
r.post('/n8n/import-ford-im', requireAdmin, wrap(async (req, res) => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const wf = JSON.parse(fs.readFileSync(path.resolve(here, '../data/n8n/ford-im-whatsapp-agent.json'), 'utf8'));
  const body = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });
  const list = await n8n('/workflows?limit=250');
  const existing = list.data.find((w) => w.name === wf.name);
  const out = existing ? await n8n(`/workflows/${existing.id}`, { method: 'PUT', body }) : await n8n('/workflows', { method: 'POST', body });
  res.json({ action: existing ? 'updated' : 'created', id: out.id, name: out.name, active: out.active });
}));

export default r;
