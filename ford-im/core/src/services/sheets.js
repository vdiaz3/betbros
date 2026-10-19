// Lee el Google Sheet de vehículos / precios / promociones vía CSV publicado.
// Cada pestaña debe tener una columna `vehicle_id` que coincida con data/vehicles.json.
// Las demás columnas son libres: se entregan tal cual al agente.
import { config, mediaUrl } from '../config.js';
import { vehicles, getVehicle } from '../data/catalog.js';
import { loc } from '../lib/i18n.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  const [header = [], ...data] = rows;
  const keys = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const cache = new Map();

async function loadCsv(url) {
  if (!url) return [];
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < config.sheets.cacheSeconds * 1000) return hit.rows;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = parseCsv(await res.text());
    cache.set(url, { at: Date.now(), rows });
    return rows;
  } catch (err) {
    console.warn('[sheets] no se pudo leer', url, err.message);
    return hit?.rows ?? []; // si falla, servimos la última copia buena
  }
}

// Promoción vigente si la fecha de hoy cae dentro de vigencia_inicio..vigencia_fin (YYYY-MM-DD).
export function isPromoActive(p, today = new Date().toISOString().slice(0, 10)) {
  const from = p.vigencia_inicio || p.valid_from;
  const to = p.vigencia_fin || p.valid_to;
  return (!from || from <= today) && (!to || to >= today);
}

export async function vehicleInfo(vehicleId, lang = 'es') {
  const v = getVehicle(vehicleId);
  if (!v) return null;
  const [specs, prices, promos] = await Promise.all([
    loadCsv(config.sheets.vehiclesCsv),
    loadCsv(config.sheets.pricesCsv),
    loadCsv(config.sheets.promosCsv),
  ]);
  const mine = (rows) => rows.filter((r) => r.vehicle_id === vehicleId);
  return {
    id: v.id,
    name: loc(v.name, lang),
    tagline: loc(v.tagline, lang),
    video_url: mediaUrl(v.video_url),
    datasheet_url: mediaUrl(v.datasheet_pdf),
    specs: mine(specs),
    prices: mine(prices),
    promotions: mine(promos).filter((p) => isPromoActive(p)),
  };
}

export async function allVehicles(lang = 'es') {
  return Promise.all(vehicles.map((v) => vehicleInfo(v.id, lang)));
}
