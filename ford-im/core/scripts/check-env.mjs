// Prueba la conexión con cada servicio usando las variables de entorno (o ../.env).
// Nunca imprime valores secretos.
//   npm run check:env
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2].startsWith('"') ? JSON.parse(m[2]) : m[2];
  }
}
const e = process.env;
const t = (ms = 10000) => AbortSignal.timeout(ms);
const results = [];
async function check(name, needed, fn) {
  if (!needed.every((k) => e[k])) return results.push([name, '⏭️', `faltan: ${needed.filter((k) => !e[k]).join(', ')}`]);
  try { results.push([name, '✅', await fn()]); } catch (err) { results.push([name, '❌', err.message.slice(0, 200)]); }
}
const json = async (res) => { const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(j.error || j).slice(0, 150)}`); return j; };

await check('WhatsApp Cloud API', ['WA_ACCESS_TOKEN', 'WA_PHONE_NUMBER_ID'], async () => {
  const j = await json(await fetch(`https://graph.facebook.com/${e.WA_GRAPH_VERSION || 'v23.0'}/${e.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${e.WA_ACCESS_TOKEN}` }, signal: t() }));
  return `${j.verified_name} ${j.display_phone_number}`;
});
await check('ElevenLabs', ['ELEVENLABS_API_KEY'], async () => {
  const j = await json(await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': e.ELEVENLABS_API_KEY }, signal: t() }));
  let agent = '';
  if (e.ELEVENLABS_KIOSK_AGENT_ID) {
    await json(await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${e.ELEVENLABS_KIOSK_AGENT_ID}`, { headers: { 'xi-api-key': e.ELEVENLABS_API_KEY }, signal: t() }));
    agent = ' · agente del kiosco OK';
  }
  return `plan ${j.tier}${agent}`;
});
await check('DocuSign (JWT)', ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID', 'DOCUSIGN_ACCOUNT_ID', 'DOCUSIGN_PRIVATE_KEY_B64'], async () => {
  const aud = e.DOCUSIGN_AUTH_SERVER || 'account-d.docusign.com';
  const key = Buffer.from(e.DOCUSIGN_PRIVATE_KEY_B64, 'base64').toString('utf8');
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b({ alg: 'RS256', typ: 'JWT' })}.${b({ iss: e.DOCUSIGN_INTEGRATION_KEY, sub: e.DOCUSIGN_USER_ID, aud, iat, exp: iat + 600, scope: 'signature impersonation' })}`;
  const assertion = `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
  const res = await fetch(`https://${aud}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: t() });
  const j = await res.json().catch(() => ({}));
  if (j.error === 'consent_required') {
    throw new Error(`falta otorgar consentimiento una vez: https://${aud}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${e.DOCUSIGN_INTEGRATION_KEY}&redirect_uri=https://cotizador.menteia.com/firma/gracias`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${j.error || ''}`);
  const info = await json(await fetch(`https://${aud}/oauth/userinfo`, { headers: { Authorization: `Bearer ${j.access_token}` }, signal: t() }));
  const acct = info.accounts.find((a) => a.account_id === e.DOCUSIGN_ACCOUNT_ID);
  if (!acct) throw new Error('el usuario no tiene acceso a DOCUSIGN_ACCOUNT_ID');
  return `${acct.account_name} (${acct.base_uri})`;
});
await check('SMTP', ['SMTP_URL'], async () => {
  const { default: nodemailer } = await import('nodemailer');
  await nodemailer.createTransport(e.SMTP_URL).verify();
  return 'conexión y autenticación OK';
});
await check('n8n', ['N8N_BASE_URL', 'N8N_API_TOKEN'], async () => {
  const j = await json(await fetch(`${e.N8N_BASE_URL.replace(/\/$/, '')}/api/v1/workflows?limit=50`, { headers: { 'X-N8N-API-KEY': e.N8N_API_TOKEN }, signal: t() }));
  return `${j.data?.length ?? 0} workflows visibles`;
});
await check('Google Sheets', ['SHEET_VEHICLES_CSV'], async () => {
  const res = await fetch(e.SHEET_VEHICLES_CSV, { signal: t() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const first = (await res.text()).split('\n')[0];
  if (!first.includes('vehicle_id')) throw new Error('la primera fila no tiene la columna vehicle_id');
  return `columnas: ${first.slice(0, 80)}`;
});
await check('CRM Twenty', ['CRM_BASE_URL', 'CRM_API_KEY'], async () => {
  await json(await fetch(`${e.CRM_BASE_URL.replace(/\/$/, '')}/rest/people?limit=1`, { headers: { Authorization: `Bearer ${e.CRM_API_KEY}` }, signal: t() }));
  return 'API OK';
});

for (const [name, icon, detail] of results) console.log(`${icon} ${name.padEnd(20)} ${detail}`);
process.exitCode = results.some((r) => r[1] === '❌') ? 1 : 0;
