// firma.menteia.com: /s/<token> genera al vuelo la sesión de firma de DocuSign;
// /webhook recibe DocuSign Connect.
import express from 'express';
import { verifyToken } from '../lib/token.js';
import { page, esc } from '../lib/html.js';
import { publicUrl } from '../config.js';
import { getCredit, getCreditByEnvelope } from '../services/credit.js';
import * as docusign from '../services/docusign.js';
import { onEnvelopeCompleted, signerFor } from '../services/flow.js';
import { logEvent } from '../db.js';

const r = express.Router();

r.get('/s/:token', async (req, res, next) => {
  try {
    const p = verifyToken(req.params.token, 'sign');
    const credit = p && getCredit(p.c);
    if (!credit || credit.status !== 'signing') {
      return res.status(410).send(page({ title: 'Firma', body: '<div class="card center"><p>Esta liga ya no está activa. / This link is no longer active.</p></div>' }));
    }
    if (!docusign.docusignEnabled()) {
      // Modo desarrollo: simula la firma.
      return res.send(page({ title: 'Firma (demo)', body: `<div class="card center"><p>DocuSign no configurado (modo demo).</p>
        <form method="post" action="/s/${esc(req.params.token)}/demo-complete"><button class="btn">Simular firma</button></form></div>` }));
    }
    const url = await docusign.recipientViewUrl({ envelopeId: credit.envelope_id, signer: signerFor(credit), returnUrl: publicUrl('firma', '/gracias') });
    logEvent('signing_opened', { sessionId: credit.session_id });
    res.redirect(302, url);
  } catch (err) { next(err); }
});

r.post('/s/:token/demo-complete', async (req, res, next) => {
  try {
    if (docusign.docusignEnabled()) return res.status(404).end();
    const p = verifyToken(req.params.token, 'sign');
    const credit = p && getCredit(p.c);
    if (!credit) return res.status(410).end();
    await onEnvelopeCompleted(credit);
    res.redirect(303, '/gracias');
  } catch (err) { next(err); }
});

r.get('/gracias', (req, res) => {
  const ev = req.query.event;
  const ok = !ev || ev === 'signing_complete';
  res.send(page({
    title: 'Firma',
    body: `<div class="card center"><h1>${ok ? '✅' : '⚠️'}</h1><p>${ok
      ? 'Gracias, tu solicitud quedó firmada. Te avisaremos por WhatsApp. / Thank you, your application is signed.'
      : 'La firma no se completó. Puedes volver a abrir la liga desde WhatsApp. / Signing was not completed.'}</p></div>`,
  }));
});

r.post('/webhook', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  if (!docusign.verifyConnectSignature(req.body, req.get('x-docusign-signature-1'))) return res.status(401).end();
  let evt;
  try { evt = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).end(); }
  const envelopeId = evt.data?.envelopeId;
  const credit = envelopeId && getCreditByEnvelope(envelopeId);
  res.status(200).end(); // acuse inmediato; el procesamiento sigue en segundo plano
  if (!credit) return;
  logEvent(`docusign_${evt.event}`, { sessionId: credit.session_id });
  if (evt.event === 'envelope-completed') onEnvelopeCompleted(credit).catch((err) => console.error('[firma] envío al banco falló', err));
});

r.use((err, req, res, _next) => {
  console.error('[firma]', err);
  res.status(err.status || 500).send(page({ title: 'Error', body: '<div class="card center"><p class="error">Ocurrió un error. Intenta de nuevo.</p></div>' }));
});
export default r;
