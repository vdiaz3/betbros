// Portada del demo (cotizador.menteia.com/): accesos a cada parte del recorrido.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, publicUrl } from '../config.js';
import { vehicles, kiosks } from '../data/catalog.js';
import { loc } from '../lib/i18n.js';
import { page, esc } from '../lib/html.js';

const media = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/media');
const ls = (dir) => { try { return fs.readdirSync(path.join(media, dir)).filter((f) => !f.startsWith('.') && !f.endsWith('.txt')); } catch { return []; } };

export default function demoHome(req, res) {
  const kiosk = kiosks[0];
  const key = config.kioskKeys[kiosk?.id];
  const card = (title, desc, href, cta) => `<div class="card" style="margin-bottom:12px"><h2 style="margin:0 0 4px;font-size:1.1rem">${title}</h2><p style="margin:0 0 6px">${desc}</p><a class="btn" href="${esc(href)}">${cta}</a></div>`;
  const videos = ls('videos');
  const pdfs = ls('pdf');
  res.send(page({
    title: 'Ford IM · Cotizador (demo)',
    body: `
<h1>Ford IM · Cotizador <small style="font-size:.6em;background:#ffcf40;color:#3b2c00;padding:2px 8px;border-radius:6px">DEMO</small></h1>
<p>Ambiente de demostración. Los datos del CRM son ficticios y la verificación de identidad es simulada.</p>
${card('📺 Kiosco con QR', 'Pantalla táctil: QR que cambia cada 30 s, 3 vehículos, ES/EN y asesor de voz.', publicUrl('kiosk', `/k/${kiosk?.id}${key ? `?key=${encodeURIComponent(key)}` : ''}`), 'Abrir kiosco')}
${card('📊 CRM (sólo lectura)', 'Funnel de venta, pipeline de leads, conversaciones de WhatsApp y agenda de pruebas de manejo.', publicUrl('vendedor', config.crmViewKey ? `/?k=${encodeURIComponent(config.crmViewKey)}` : '/'), 'Abrir CRM')}
${card('📄 Términos y avisos de privacidad', 'Términos y condiciones, aviso de privacidad y aviso para crédito (ES/EN).', publicUrl('legal', '/terminos?lang=es'), 'Ver términos')}
<div class="card"><h2 style="margin:0 0 8px;font-size:1.1rem">🎬 Videos y 📑 PDFs</h2>
<ul>${vehicles.map((v) => `<li>${esc(loc(v.name, 'es'))}: ${videos.includes(path.basename(v.video_url)) ? `<a href="${esc(publicUrl('media', `/${v.video_url}`))}">video 30 s</a>` : '<i>video pendiente</i>'}</li>`).join('')}
${pdfs.map((f) => `<li><a href="${esc(publicUrl('media', `/pdf/${f}`))}">${esc(f)}</a></li>`).join('')}
<li><a href="${esc(publicUrl('legal', '/privacidad?lang=es'))}">Aviso de privacidad</a> · <a href="${esc(publicUrl('legal', '/privacidad-credito?lang=es'))}">Aviso para crédito</a></li></ul></div>`,
  }));
}
