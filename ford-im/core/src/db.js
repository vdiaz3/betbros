// Persistencia con SQLite embebido (node:sqlite). Volumen escaso (kioscos + leads),
// por lo que no hace falta un servidor de BD aparte; el CRM (Twenty) usa su propio Postgres.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS qr_tokens (
  id TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  dealer_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  scans INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS qr_tokens_exp ON qr_tokens(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  ref TEXT UNIQUE NOT NULL,
  qr_token TEXT,
  kiosk_id TEXT,
  dealer_id TEXT,
  vehicle_id TEXT,
  lang TEXT NOT NULL DEFAULT 'es',
  wa_id TEXT,
  name TEXT,
  email TEXT,
  stage TEXT NOT NULL DEFAULT 'scanned',
  bot_paused INTEGER NOT NULL DEFAULT 0,
  crm_person_id TEXT,
  crm_opportunity_id TEXT,
  ref_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_wa ON sessions(wa_id, updated_at);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  version TEXT NOT NULL,
  channel TEXT NOT NULL,
  evidence TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_apps (
  id TEXT PRIMARY KEY,
  folio TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting',
  data_json TEXT NOT NULL DEFAULT '{}',
  envelope_id TEXT,
  decision TEXT,
  decision_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  credit_id TEXT,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kyc_checks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  curp TEXT,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  wa_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  author TEXT NOT NULL,
  type TEXT NOT NULL,
  body TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, id);

CREATE TABLE IF NOT EXISTS test_drives (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  dealer_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS test_drives_slot ON test_drives(dealer_id, starts_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  kiosk_id TEXT,
  type TEXT NOT NULL,
  data_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_type ON events(type, created_at);
`;

export function getDb() {
  if (!db) {
    const file = config.dataDir === ':memory:' ? ':memory:' : path.join(config.dataDir, 'ford-im.sqlite');
    if (file !== ':memory:') fs.mkdirSync(config.dataDir, { recursive: true });
    db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    migrate(db);
  }
  return db;
}

// Columnas agregadas después de la primera versión (SQLite no tiene ADD COLUMN IF NOT EXISTS).
function migrate(d) {
  const cols = (t) => d.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  if (!cols('sessions').includes('assigned_to')) d.exec('ALTER TABLE sessions ADD COLUMN assigned_to TEXT');
  if (!cols('sessions').includes('last_inbound_at')) d.exec('ALTER TABLE sessions ADD COLUMN last_inbound_at INTEGER');
  if (!cols('kyc_checks').includes('doc_type')) d.exec('ALTER TABLE kyc_checks ADD COLUMN doc_type TEXT');
}

export const now = () => Date.now();
export const uid = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para códigos que el usuario ve o dicta.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function shortCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function logEvent(type, { sessionId = null, kioskId = null, data = null } = {}) {
  getDb()
    .prepare('INSERT INTO events (session_id, kiosk_id, type, data_json, created_at) VALUES (?,?,?,?,?)')
    .run(sessionId, kioskId, type, data ? JSON.stringify(data) : null, now());
}

export function filesDir(...parts) {
  const dir = path.join(config.dataDir, 'files', ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
