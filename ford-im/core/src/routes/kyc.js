// kyc.menteia.com/k/<token>: verificación de identidad breve desde el celular.
import express from 'express';
import multer from 'multer';
import { verifyToken } from '../lib/token.js';
import { page, esc } from '../lib/html.js';
import { rateLimit } from '../lib/auth.js';
import { getKyc, submitKyc } from '../services/kyc.js';
import { getSession } from '../services/sessions.js';
import { config, publicUrl } from '../config.js';
import { normLang } from '../lib/i18n.js';
import * as wa from '../services/whatsapp.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 3 } });
const r = express.Router();

const T = {
  es: {
    title: 'Verificación de identidad', intro: 'Para proteger tu identidad y agilizar tu crédito, necesitamos 3 fotos y tu CURP. Toma 2 minutos.',
    front: 'INE – frente', back: 'INE – reverso', selfie: 'Selfie (rostro descubierto, buena luz)', curp: 'CURP',
    consent: 'Otorgo mi consentimiento expreso para el tratamiento de mis datos biométricos e identificación oficial con el fin de verificar mi identidad, conforme al',
    notice: 'Aviso de Privacidad para Crédito', submit: 'Enviar', done: '¡Listo! Recibimos tus documentos. Regresa a WhatsApp para continuar.',
    expired: 'Esta liga expiró o ya fue utilizada. Pide una nueva en WhatsApp.', errors: 'Revisa la información:',
  },
  en: {
    title: 'Identity verification', intro: 'To protect your identity and speed up your financing we need 3 photos and your CURP. It takes 2 minutes.',
    front: 'INE / ID – front', back: 'INE / ID – back', selfie: 'Selfie (face uncovered, good lighting)', curp: 'CURP',
    consent: 'I give my express consent to the processing of my biometric data and official ID to verify my identity, as described in the',
    notice: 'Credit Privacy Notice', submit: 'Submit', done: 'Done! We received your documents. Go back to WhatsApp to continue.',
    expired: 'This link has expired or was already used. Ask for a new one on WhatsApp.', errors: 'Please check:',
  },
};

function load(req) {
  const p = verifyToken(req.params.token, 'kyc');
  const kyc = p && getKyc(p.k);
  return kyc ? { kyc, lang: normLang(p.l) } : null;
}

function form(tx, lang, token, errors = []) {
  return page({
    title: tx.title, lang,
    body: `<div class="card">
<h1>🪪 ${esc(tx.title)}</h1><p>${esc(tx.intro)}</p>
${errors.length ? `<p class="error">${esc(tx.errors)} ${errors.map(esc).join(', ')}</p>` : ''}
<form method="post" enctype="multipart/form-data" action="/k/${esc(token)}">
  <label>${esc(tx.front)}<input type="file" name="ine_frente" accept="image/*" capture="environment" required></label>
  <label>${esc(tx.back)}<input type="file" name="ine_reverso" accept="image/*" capture="environment" required></label>
  <label>${esc(tx.selfie)}<input type="file" name="selfie" accept="image/*" capture="user" required></label>
  <label>${esc(tx.curp)}<input name="curp" maxlength="18" pattern="[A-Za-z0-9]{18}" autocapitalize="characters" required></label>
  <label class="check"><input type="checkbox" name="consent" value="1" required> ${esc(tx.consent)} <a href="${esc(publicUrl('legal', `/privacidad-credito?lang=${lang}`))}" target="_blank">${esc(tx.notice)}</a>.</label>
  <button class="btn" type="submit">${esc(tx.submit)}</button>
</form></div>`,
  });
}

r.get('/k/:token', (req, res) => {
  const ctx = load(req);
  if (!ctx) return res.status(410).send(page({ title: 'KYC', body: `<div class="card center"><p>${esc(T.es.expired)}<br>${esc(T.en.expired)}</p></div>` }));
  const tx = T[ctx.lang];
  if (ctx.kyc.status !== 'pending') return res.send(page({ title: tx.title, lang: ctx.lang, body: `<div class="card center"><h1>✅</h1><p>${esc(tx.done)}</p></div>` }));
  res.send(form(tx, ctx.lang, req.params.token));
});

r.post('/k/:token', rateLimit({ windowMs: 10 * 60_000, max: 10 }),
  upload.fields([{ name: 'ine_frente', maxCount: 1 }, { name: 'ine_reverso', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const ctx = load(req);
      if (!ctx || ctx.kyc.status !== 'pending') return res.status(410).send(page({ title: 'KYC', body: `<div class="card center"><p>${esc(T.es.expired)}</p></div>` }));
      const tx = T[ctx.lang];
      const files = Object.fromEntries(Object.entries(req.files || {}).map(([k, v]) => [k, v[0]]));
      const out = await submitKyc(ctx.kyc.id, { curp: String(req.body.curp || ''), files, consent: req.body.consent === '1', userAgent: req.get('user-agent'), ip: req.ip });
      if (!out.ok) return res.status(422).send(form(tx, ctx.lang, req.params.token, out.errors));
      const s = getSession(ctx.kyc.session_id);
      wa.sendText(s.wa_id, ctx.lang === 'en' ? '✅ We received your ID. Let\'s continue with your application.' : '✅ Recibimos tu identificación. Sigamos con tu solicitud.').catch(() => {});
      res.send(page({ title: tx.title, lang: ctx.lang, body: `<div class="card center"><h1>✅</h1><p>${esc(tx.done)}</p><a class="btn wa" href="https://wa.me/${esc(config.whatsapp.displayNumber)}">WhatsApp</a></div>` }));
    } catch (err) { next(err); }
  });

r.use((err, req, res, _next) => {
  console.error('[kyc]', err.message);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500).send(page({ title: 'KYC', body: `<div class="card center"><p class="error">${esc(err.code === 'LIMIT_FILE_SIZE' ? 'Archivo demasiado grande (máx. 8 MB) / File too large' : 'Error')}</p></div>` }));
});
export default r;
