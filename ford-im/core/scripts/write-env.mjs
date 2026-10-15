// Escribe ford-im/.env a partir de las variables del entorno (p. ej. las que se guardan como
// variables del entorno de la nube) sin imprimir ningún valor secreto.
//   node scripts/write-env.mjs            → escribe ../.env (no se sube a git)
//   node scripts/write-env.mjs --dry-run  → sólo muestra qué falta
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SERVICES } from './env-vars.mjs';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
const dry = process.argv.includes('--dry-run');
const GENERATED = { APP_SECRET: 32, N8N_API_KEY: 24, ADMIN_API_KEY: 24, CRM_VIEW_KEY: 9 };
const lines = ['# Generado por core/scripts/write-env.mjs — NO subir a git', ''];
const missing = [];

for (const svc of SERVICES) {
  lines.push(`# --- ${svc.label} ---`);
  for (const [name, def, secret] of svc.vars) {
    let v = process.env[name] ?? def;
    if (!v && GENERATED[name]) v = crypto.randomBytes(GENERATED[name]).toString('hex');
    if (!v && name === 'KIOSK_KEYS') v = `K-DEMO-01:${crypto.randomBytes(9).toString('base64url')}`;
    if (!v) { missing.push(`${svc.id}: ${name}`); lines.push(`${name}=`); continue; }
    lines.push(`${name}=${/[\s#"']/.test(v) ? JSON.stringify(v) : v}`);
    console.log(`  ✓ ${name}${secret ? ' (secreto)' : ''}${process.env[name] ? '' : ' [valor por defecto/generado]'}`);
  }
  lines.push('');
}
if (!dry) {
  fs.writeFileSync(out, lines.join('\n'), { mode: 0o600 });
  console.log(`\n.env escrito en ${out}`);
}
if (missing.length) console.log(`\nFaltan (${missing.length}):\n  ${missing.join('\n  ')}`);
