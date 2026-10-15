// fordim.menteia.com: app del panel táctil. /k/<kioskId>?key=… abre el kiosco.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireKiosk } from '../lib/auth.js';
import { issueQrToken, renderQrSvg } from '../services/qr.js';
import { kioskAgentSignedUrl } from '../services/voice.js';
import { vehicles, getKiosk, getDealer } from '../data/catalog.js';
import { logEvent } from '../db.js';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/kiosk');
const r = express.Router();

r.use('/kiosk', express.static(pub, { maxAge: '1h' }));
// <base href> = ruta donde está montado el kiosco (raíz de su subdominio o /kiosco).
const indexHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
r.get(['/', '/k/:kioskId'], (req, res) => res.type('html').send(indexHtml.replace('__BASE__', `${req.baseUrl}/`)));

r.get('/api/config', requireKiosk, (req, res) => {
  const kiosk = getKiosk(req.kioskId);
  res.json({
    kiosk,
    dealer: getDealer(kiosk?.dealer_id),
    vehicles: vehicles.map(({ id, name, tagline, hero_image, price_from_mxn, accent }) => ({ id, name, tagline, hero_image, price_from_mxn, accent })),
  });
});

r.get('/api/qr', requireKiosk, (req, res) => {
  const q = issueQrToken({ kioskId: req.kioskId, vehicleId: req.query.vehicle, lang: req.query.lang });
  res.set('Cache-Control', 'no-store').json({ ...q, svg: renderQrSvg(q.url, { logoHref: `${req.baseUrl}/kiosk/assets/ford-logo.png` }) });
});

r.post('/api/eleven/session', requireKiosk, express.json(), async (req, res, next) => {
  try {
    const signedUrl = await kioskAgentSignedUrl();
    logEvent('voice_agent_started', { kioskId: req.kioskId, data: { vehicle: req.body?.vehicle, lang: req.body?.lang } });
    res.json({ signedUrl });
  } catch (err) { next(err); }
});

r.post('/api/heartbeat', requireKiosk, express.json(), (req, res) => {
  logEvent('kiosk_heartbeat', { kioskId: req.kioskId, data: req.body });
  res.json({ ok: true, serverTime: Date.now() });
});

r.use((err, req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
export default r;
