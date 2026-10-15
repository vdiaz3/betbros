// Un solo proceso sirve todos los subdominios de menteia.com; se despacha por cabecera Host.
// Caddy (../../Caddyfile) termina TLS y reenvía cada subdominio a este contenedor.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getDb } from './db.js';
import api from './routes/api.js';
import admin from './routes/admin.js';
import go from './routes/go.js';
import kiosk from './routes/kiosk.js';
import kyc from './routes/kyc.js';
import firma from './routes/firma.js';
import bancos from './routes/bancos.js';
import legal from './routes/legal.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  getDb();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    });
    next();
  });
  app.use('/assets', express.static(path.resolve(here, '../public/assets'), { maxAge: '1d' }));

  const sites = {
    [config.hosts.api]: express.Router().use(api).use('/admin', admin),
    [config.hosts.go]: go,
    [config.hosts.kiosk]: kiosk,
    [config.hosts.kyc]: kyc,
    [config.hosts.firma]: firma,
    [config.hosts.bancos]: bancos,
    [config.hosts.legal]: legal,
  };
  app.use((req, res, next) => {
    const site = sites[(req.headers.host || '').toLowerCase()];
    if (!site) return res.status(404).send('Not found');
    site(req, res, next);
  });
  app.use((req, res) => res.status(404).send('Not found'));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(config.port, () => {
    console.log(`Ford IM core escuchando en :${config.port}`);
    for (const [k, h] of Object.entries(config.hosts)) console.log(`  ${k.padEnd(7)} → ${config.publicScheme}://${h}`);
  });
}
