// Configura un entorno aislado antes de importar la app.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fordim-'));
Object.assign(process.env, {
  DATA_DIR: dir,
  APP_SECRET: 'test-secret',
  N8N_API_KEY: 'n8n-test',
  ADMIN_API_KEY: 'admin-test',
  KIOSK_KEYS: 'K-DEMO-01:kiosk-test',
  PUBLIC_SCHEME: 'http',
  HOST_KIOSK: 'fordim.test', HOST_GO: 'go.test', HOST_API: 'api.test', HOST_KYC: 'kyc.test',
  HOST_FIRMA: 'firma.test', HOST_BANCOS: 'bancos.test', HOST_LEGAL: 'legal.test',
  WA_DISPLAY_NUMBER: '5215511112222',
});

export async function startApp() {
  const { createApp } = await import('../src/server.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  // fetch() no permite fijar la cabecera Host, que es como el servidor elige el subdominio.
  const req = (host, p, { method = 'GET', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const r = http.request({ port, path: p, method, headers: { ...headers, host } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, text: async () => buf.toString(), json: async () => JSON.parse(buf.toString()) });
        });
      });
      r.on('error', reject);
      if (body) r.write(typeof body === 'string' ? body : body.toString());
      r.end();
    });
  return { server, req };
}
