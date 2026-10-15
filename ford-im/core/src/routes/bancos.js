// bancos.menteia.com: el analista del banco registra el dictamen con la liga del correo
// (o descarga el expediente si BANK_DELIVERY_MODE=secure_link).
import express from 'express';
import fs from 'node:fs';
import { verifyToken } from '../lib/token.js';
import { page, esc } from '../lib/html.js';
import { rateLimit } from '../lib/auth.js';
import { getCredit, listDocuments } from '../services/credit.js';
import { getBank } from '../data/catalog.js';
import { onBankDecision } from '../services/flow.js';
import { logEvent } from '../db.js';

const r = express.Router();
r.use(rateLimit({ windowMs: 60_000, max: 60 }));

const load = (token) => {
  const p = verifyToken(token, 'bank');
  return p ? getCredit(p.c) : null;
};

r.get('/r/:token', (req, res) => {
  const credit = load(req.params.token);
  if (!credit) return res.status(410).send(page({ title: 'Dictamen', body: '<div class="card center"><p>Liga inválida o vencida.</p></div>' }));
  const bank = getBank(credit.bank_id);
  const decided = !['sent_to_bank', 'bank_more_info'].includes(credit.status);
  res.send(page({
    title: `Dictamen ${credit.folio}`,
    body: `<div class="card"><h1>Dictamen · ${esc(bank.name)}</h1>
<p>Folio <b>${esc(credit.folio)}</b> · Solicitante: <b>${esc([credit.data.nombres, credit.data.apellido_paterno].join(' '))}</b></p>
${decided ? `<p>Dictamen registrado: <b>${esc(credit.status)}</b></p>` : `
<form method="post" action="/r/${esc(req.params.token)}" class="grid">
  <label>Resultado
    <select name="status" required>
      <option value="approved">Aprobado</option>
      <option value="more_info">Requiere información adicional</option>
      <option value="rejected">Rechazado</option>
    </select></label>
  <label>Tasa anual autorizada (%)<input name="rate" inputmode="decimal"></label>
  <label>Plazo autorizado (meses)<input name="term" inputmode="numeric"></label>
  <label>Enganche requerido (MXN)<input name="down_payment" inputmode="decimal"></label>
  <label>Notas / información requerida<textarea name="notes" rows="4" maxlength="1000"></textarea></label>
  <label>Nombre del analista<input name="analyst" required maxlength="120"></label>
  <button class="btn" type="submit">Registrar dictamen</button>
</form>`}</div>`,
  }));
});

r.post('/r/:token', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const credit = load(req.params.token);
    if (!credit) return res.status(410).end();
    const { status, rate, term, down_payment, notes, analyst } = req.body;
    await onBankDecision(credit.id, {
      status, rate: rate || null, term: term || null, down_payment: down_payment || null,
      notes: String(notes || '').slice(0, 1000), analyst: String(analyst || '').slice(0, 120), ip: req.ip,
    });
    res.send(page({ title: 'Dictamen', body: '<div class="card center"><h1>✅</h1><p>Dictamen registrado. El cliente y el distribuidor fueron notificados.</p></div>' }));
  } catch (err) { next(err); }
});

// Expediente por liga con caducidad (alternativa a adjuntos).
r.get('/f/:token', (req, res) => {
  const p = verifyToken(req.params.token, 'files');
  const credit = p && getCredit(p.c);
  if (!credit) return res.status(410).send(page({ title: 'Expediente', body: '<div class="card center"><p>Liga inválida o vencida.</p></div>' }));
  const docs = listDocuments(credit.id);
  res.send(page({
    title: `Expediente ${credit.folio}`,
    body: `<div class="card"><h1>Expediente ${esc(credit.folio)}</h1><ul>${docs.map((d) => `<li><a href="/f/${esc(req.params.token)}/${esc(d.id)}">${esc(d.filename)}</a> <small>SHA-256 ${esc(d.sha256.slice(0, 12))}…</small></li>`).join('')}</ul></div>`,
  }));
});
r.get('/f/:token/:docId', (req, res) => {
  const p = verifyToken(req.params.token, 'files');
  const doc = p && listDocuments(p.c).find((d) => d.id === req.params.docId);
  if (!doc) return res.status(404).end();
  logEvent('bank_file_download', { data: { credit: p.c, doc: doc.id, ip: req.ip } });
  res.type(doc.mime).set('Content-Disposition', `attachment; filename="${doc.filename}"`).send(fs.readFileSync(doc.path));
});

r.use((err, req, res, _next) => {
  res.status(err.status || 500).send(page({ title: 'Error', body: `<div class="card center"><p class="error">${esc(err.message)}</p></div>` }));
});
export default r;
