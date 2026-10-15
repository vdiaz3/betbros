// Importa (o actualiza) el workflow del agente en tu n8n vía su API pública.
//   N8N_BASE_URL=https://n8n.tudominio.com N8N_API_TOKEN=... node scripts/n8n-import.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { N8N_BASE_URL, N8N_API_TOKEN } = process.env;
if (!N8N_BASE_URL || !N8N_API_TOKEN) throw new Error('Faltan N8N_BASE_URL y N8N_API_TOKEN');
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../n8n/ford-im-whatsapp-agent.json');
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = `${N8N_BASE_URL.replace(/\/$/, '')}/api/v1`;
const headers = { 'X-N8N-API-KEY': N8N_API_TOKEN, 'Content-Type': 'application/json' };
const body = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });

const list = await (await fetch(`${base}/workflows?limit=250`, { headers })).json();
const existing = list.data?.find((w) => w.name === wf.name);
const res = existing
  ? await fetch(`${base}/workflows/${existing.id}`, { method: 'PUT', headers, body })
  : await fetch(`${base}/workflows`, { method: 'POST', headers, body });
const j = await res.json();
if (!res.ok) throw new Error(`n8n ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
console.log(`${existing ? 'Actualizado' : 'Creado'}: ${j.name} (id ${j.id}). Asigna las credenciales "Ford IM API" y "Anthropic" en n8n y actívalo.`);
