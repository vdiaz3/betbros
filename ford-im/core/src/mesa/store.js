// Vamo Mesa: comedores corporativos. Tablas propias (prefijo mesa_) en la misma base SQLite.
import { getDb } from '../db.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mesa_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,            -- menu | premium | grab_go
  price_mxn REAL NOT NULL,
  benefit_eligible INTEGER NOT NULL DEFAULT 1,
  kcal INTEGER,
  tags TEXT,
  emoji TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mesa_menu (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,                -- YYYY-MM-DD (hora de la Ciudad de México)
  item_id TEXT NOT NULL,
  planned_qty INTEGER NOT NULL,
  UNIQUE (date, item_id)
);
CREATE TABLE IF NOT EXISTS mesa_ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,                -- kg | l | pza
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mesa_recipes (
  item_id TEXT NOT NULL,
  ingredient_id TEXT NOT NULL,
  qty REAL NOT NULL,                 -- por porción, en la unidad del insumo
  PRIMARY KEY (item_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS mesa_stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id TEXT NOT NULL,
  delta REAL NOT NULL,
  reason TEXT NOT NULL,              -- order | cancel | entrada | merma | ajuste
  ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mesa_employees (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  area TEXT,
  pin TEXT NOT NULL,
  benefit_monthly REAL NOT NULL DEFAULT 0,
  benefit_balance REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mesa_orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  date TEXT NOT NULL,
  employee_id TEXT,
  channel TEXT NOT NULL,             -- web | kiosk
  status TEXT NOT NULL,              -- paid | preparing | ready | delivered | cancelled
  total REAL NOT NULL,
  benefit_used REAL NOT NULL DEFAULT 0,
  card_paid REAL NOT NULL DEFAULT 0,
  pickup TEXT,
  created_at INTEGER NOT NULL,
  preparing_at INTEGER,
  ready_at INTEGER,
  delivered_at INTEGER,
  printed_at INTEGER
);
CREATE INDEX IF NOT EXISTS mesa_orders_date ON mesa_orders(date, status);
CREATE TABLE IF NOT EXISTS mesa_order_items (
  order_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price_mxn REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS mesa_surveys (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  employee_id TEXT,
  sent_at INTEGER,
  rating INTEGER,
  liked TEXT,
  disliked TEXT,
  improve TEXT,
  answered_at INTEGER
);
CREATE TABLE IF NOT EXISTS mesa_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`;

let ready = false;
export function mdb() {
  const d = getDb();
  if (!ready) { d.exec(SCHEMA); ready = true; }
  return d;
}
