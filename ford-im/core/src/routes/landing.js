// Landing comercial (cotizador.menteia.com/): producto, precio y accesos al demo en vivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config, publicUrl } from '../config.js';
import { kiosks, vehicles } from '../data/catalog.js';
import { signToken } from '../lib/token.js';
import { rateLimit } from '../lib/auth.js';
import { normLang } from '../lib/i18n.js';
import { createWebDemoSession } from '../services/sessions.js';
import { startKyc } from '../services/kyc.js';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/landing');
const template = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export const assets = express.static(pub, { maxAge: '1h', index: false });

let html = null;
export function home(req, res) {
  // Se arma una sola vez: las ligas sólo dependen de la configuración.
  html ??= (() => {
    const kiosk = kiosks[0];
    const key = config.kioskKeys[kiosk?.id];
    const view = config.crmViewKey ? `?k=${encodeURIComponent(config.crmViewKey)}` : '';
    const vars = {
      BASE: '/',
      KIOSK_URL: publicUrl('kiosk', `/k/${kiosk?.id}${key ? `?key=${encodeURIComponent(key)}` : ''}`),
      CRM_URL: publicUrl('vendedor', `/${view}`),
      FUNNEL_URL: publicUrl('vendedor', `/funnel${view}`),
      KYC_URL: '/demo/kyc',
      CREDIT_BLANK: publicUrl('media', '/pdf/solicitud-credito-bbva-demo.pdf'),
      CREDIT_FILLED: publicUrl('media', '/pdf/ejemplo-solicitud-llenada-bbva-demo.pdf'),
      FICHA_URL: publicUrl('media', `/${vehicles[0]?.datasheet_pdf}`),
      TERMS_URL: publicUrl('legal', '/terminos?lang=es'),
      PRIVACY_URL: publicUrl('legal', '/privacidad?lang=es'),
      CONTACT_URL: process.env.SALES_CONTACT_URL || '#demo',
    };
    return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? attr(vars[k]) : m));
  })();
  res.set('Cache-Control', 'no-cache').type('html').send(html);
}

// Abre una verificación KYC de prueba (sólo con el proveedor simulado) y lleva al visitante a ella.
export const demoKyc = [
  rateLimit({ windowMs: 10 * 60_000, max: 10 }),
  (req, res) => {
    if (config.kyc.provider !== 'simulated') return res.status(404).send('Not found');
    const lang = normLang(req.query.lang);
    const s = createWebDemoSession({ kiosk: kiosks[0], vehicleId: vehicles[0]?.id, lang });
    const kyc = startKyc(s.id);
    const token = signToken('kyc', { k: kyc.id, l: lang }, 3600);
    res.redirect(302, publicUrl('kyc', `/k/${token}`));
  },
];
