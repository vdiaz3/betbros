// Un solo proceso sirve todos los subdominios de menteia.com; se despacha por cabecera Host.
// Caddy (../../Caddyfile) termina TLS y reenvía cada subdominio a este contenedor.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, PREFIX } from './config.js';
import { getDb } from './db.js';
import api from './routes/api.js';
import admin from './routes/admin.js';
import go from './routes/go.js';
import kiosk from './routes/kiosk.js';
import kyc from './routes/kyc.js';
import firma from './routes/firma.js';
import bancos from './routes/bancos.js';
import legal from './routes/legal.js';
import vendedor from './routes/vendedor.js';
import { sendDueReminders } from './services/testdrive.js';
import demoHome from './routes/demo-home.js';
import { seedDemo } from './demo/seed.js';

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
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/assets', express.static(path.resolve(here, '../public/assets'), { maxAge: '1d' }));

  const routers = {
    api: express.Router().use(api).use('/admin', admin),
    go, kiosk, kyc, firma, bancos, legal, vendedor,
    media: express.static(path.resolve(here, '../public/media'), { maxAge: '1h' }),
  };

  // Modo demo: un solo subdominio (SINGLE_HOST=cotizador.menteia.com), cada sitio en su ruta.
  const single = express.Router();
  single.get('/', demoHome);
  for (const [key, router] of Object.entries(routers)) single.use(PREFIX[key], router);

  // Modo completo: un subdominio por sitio.
  const sites = Object.fromEntries(Object.entries(routers).map(([key, router]) => [config.hosts[key], router]));

  app.use((req, res, next) => {
    const host = (req.headers.host || '').toLowerCase();
    if (config.singleHost && host === config.singleHost) return single(req, res, next);
    const site = sites[host];
    if (!site) return res.status(404).send('Not found');
    site(req, res, next);
  });
  app.use((req, res) => res.status(404).send('Not found'));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (config.demoSeed) console.log('[demo] datos de ejemplo:', JSON.stringify(seedDemo()));
  // Recordatorios de pruebas de manejo (revisión cada 5 min).
  setInterval(() => sendDueReminders().catch((err) => console.warn('[reminders]', err.message)), 5 * 60_000).unref();
  createApp().listen(config.port, () => {
    console.log(`Ford IM core escuchando en :${config.port}`);
    if (config.singleHost) console.log(`  demo → ${config.publicScheme}://${config.singleHost}/`);
    else for (const [k, h] of Object.entries(config.hosts)) console.log(`  ${k.padEnd(8)} → ${config.publicScheme}://${h}`);
  });
}
