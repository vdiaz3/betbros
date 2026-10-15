// go.menteia.com/q/<token>: valida el token del QR (30 s + gracia), crea la sesión con un
// código ref y redirige a WhatsApp con el mensaje pre-llenado.
import express from 'express';
import { config } from '../config.js';
import { redeemQrToken } from '../services/qr.js';
import { createSessionFromQr } from '../services/sessions.js';
import { getVehicle } from '../data/catalog.js';
import { t, loc, normLang } from '../lib/i18n.js';
import { page, esc } from '../lib/html.js';
import { rateLimit } from '../lib/auth.js';
import { logEvent } from '../db.js';

const r = express.Router();
r.get('/', (req, res) => res.redirect(302, 'https://www.ford.mx/'));

r.get('/q/:token', rateLimit({ windowMs: 60_000, max: 30 }), (req, res) => {
  const qr = redeemQrToken(req.params.token);
  const lang = normLang(req.acceptsLanguages('es', 'en') || 'es');
  if (!qr) {
    logEvent('qr_expired_scan', { data: { token: req.params.token } });
    return res.status(410).send(page({
      title: t(lang, 'qrExpiredTitle'), lang,
      body: `<div class="card center"><h1>⏱️ ${esc(t(lang, 'qrExpiredTitle'))}</h1><p>${esc(t(lang, 'qrExpired'))}</p></div>`,
    }));
  }
  const session = createSessionFromQr(qr);
  const vehicle = getVehicle(qr.vehicle_id);
  const text = t(qr.lang, 'prefill', { vehicle: loc(vehicle.name, qr.lang), ref: session.ref });
  const wa = `https://wa.me/${config.whatsapp.displayNumber}?text=${encodeURIComponent(text)}`;
  res.set('Cache-Control', 'no-store');
  // Redirección inmediata + botón de respaldo (algunos lectores de QR abren un navegador interno).
  res.send(page({
    title: 'Ford IM', lang: qr.lang,
    head: `<meta http-equiv="refresh" content="0;url=${esc(wa)}">`,
    body: `<div class="card center"><h1>${esc(loc(vehicle.name, qr.lang))}</h1>
      <a class="btn wa" href="${esc(wa)}">${esc(t(qr.lang, 'openWhatsapp'))}</a></div>
      <script>location.replace(${JSON.stringify(wa)})</script>`,
  }));
});

export default r;
