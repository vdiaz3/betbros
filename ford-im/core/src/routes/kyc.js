// kyc.menteia.com/k/<token>: verificación de identidad desde el celular (cámara en vivo).
// La página es una app ligera (public/kyc/) que captura el documento, hace la prueba de vida y
// envía todo en un solo POST.
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signToken, verifyToken } from '../lib/token.js';
import { page } from '../lib/html.js';
import { rateLimit } from '../lib/auth.js';
import { getKyc, submitKyc, pickChallenges } from '../services/kyc.js';
import { getSession } from '../services/sessions.js';
import { config, publicUrl } from '../config.js';
import { normLang } from '../lib/i18n.js';
import * as wa from '../services/whatsapp.js';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/kyc');
const FILES = ['doc_frente', 'doc_reverso', 'selfie', 'liveness_0', 'liveness_1', 'liveness_2'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: FILES.length } });
const r = express.Router();

r.use('/kyc-app', express.static(pub, { maxAge: '1h' }));

function load(token) {
  const p = verifyToken(token, 'kyc');
  const kyc = p && getKyc(p.k);
  return kyc ? { kyc, lang: normLang(p.l) } : null;
}

const expired = () => page({ title: 'KYC', body: '<div class="card center"><h1>⏱️</h1><p>Esta liga expiró o ya fue utilizada. Pide una nueva en WhatsApp.<br><small>This link has expired. Ask for a new one on WhatsApp.</small></p></div>' });

r.get('/k/:token', (req, res) => {
  const ctx = load(req.params.token);
  if (!ctx) return res.status(410).send(expired());
  // Los retos de la prueba de vida los elige el servidor y viajan firmados (no se pueden cambiar).
  const challenges = pickChallenges();
  const boot = {
    lang: ctx.lang,
    status: ctx.kyc.status,
    challenges,
    challengeToken: signToken('kyc_ch', { k: ctx.kyc.id, c: challenges }, 3600),
    privacyUrl: publicUrl('legal', `/privacidad-credito?lang=${ctx.lang}`),
    whatsappUrl: `https://wa.me/${config.whatsapp.displayNumber}`,
    demo: config.kyc.provider === 'simulated',
  };
  res.set('Cache-Control', 'no-store').send(page({
    title: ctx.lang === 'en' ? 'Identity verification' : 'Verificación de identidad',
    lang: ctx.lang,
    head: `<link rel="stylesheet" href="${req.baseUrl}/kyc-app/kyc.css">`,
    body: `<div id="kyc" class="card"></div>
<script id="boot" type="application/json">${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>
<script type="module" src="${req.baseUrl}/kyc-app/kyc.js"></script>`,
  }));
});

r.post('/k/:token', rateLimit({ windowMs: 10 * 60_000, max: 10 }), upload.fields(FILES.map((name) => ({ name, maxCount: 1 }))), async (req, res, next) => {
  try {
    const ctx = load(req.params.token);
    if (!ctx || ctx.kyc.status !== 'pending') return res.status(410).json({ error: 'expired' });
    const ch = verifyToken(req.body.challenge_token, 'kyc_ch');
    if (!ch || ch.k !== ctx.kyc.id) return res.status(400).json({ error: 'invalid_challenge_token' });
    const files = Object.fromEntries(Object.entries(req.files || {}).map(([k, v]) => [k, v[0]]));
    const out = await submitKyc(ctx.kyc.id, {
      docType: req.body.doc_type, curp: req.body.curp, files, consent: req.body.consent === '1',
      challenges: ch.c, userAgent: req.get('user-agent'), ip: req.ip,
    });
    if (!out.ok) return res.status(422).json({ errors: out.errors });
    const s = getSession(ctx.kyc.session_id);
    const approved = out.kyc.status === 'approved';
    const msg = ctx.lang === 'en'
      ? (approved ? '✅ Identity verified. Let\'s continue with your financing application.' : '✅ We received your ID; an advisor will review it shortly.')
      : (approved ? '✅ Identidad verificada. Sigamos con tu solicitud de crédito.' : '✅ Recibimos tu identificación; un asesor la revisará en breve.');
    if (s.wa_id) wa.sendText(s.wa_id, msg).catch(() => {}); // las sesiones de prueba de la landing no tienen WhatsApp
    res.json({ status: out.kyc.status, analysis: out.analysis });
  } catch (err) { next(err); }
});

r.use((err, req, res, _next) => {
  console.error('[kyc]', err.message);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'error' });
});
export default r;
