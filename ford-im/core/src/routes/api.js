// API para n8n (api.menteia.com/v1). Autenticación: Authorization: Bearer N8N_API_KEY.
// n8n recibe el webhook de WhatsApp, llama a POST /v1/inbound, pasa el contexto al agente de IA
// (cuyas herramientas son los demás endpoints) y responde con POST /v1/reply.
import express from 'express';
import { requireN8n, requireAdmin } from '../lib/auth.js';
import { config } from '../config.js';
import { detectLangSwitch, normLang, loc } from '../lib/i18n.js';
import { banks, getBank, getVehicle, getDealer, vehicles } from '../data/catalog.js';
import { logEvent } from '../db.js';
import * as sessions from '../services/sessions.js';
import * as credit from '../services/credit.js';
import * as flow from '../services/flow.js';
import { vehicleInfo, allVehicles } from '../services/sheets.js';
import { transcribe } from '../services/voice.js';
import { downloadMedia } from '../services/whatsapp.js';
import { syncSession } from '../services/crm.js';
import { latestKyc, setKycResult } from '../services/kyc.js';
import { logMessage } from '../services/messages.js';
import * as testdrive from '../services/testdrive.js';
import { dealers } from '../data/catalog.js';

const r = express.Router();
r.use(express.json({ limit: '1mb' }));
r.get('/health', (req, res) => res.json({ ok: true }));
r.use('/v1', (req, res, next) => (req.path.startsWith('/kyc/') && req.method === 'POST' ? next() : requireN8n(req, res, next)));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const mustSession = (id) => {
  const s = sessions.getSession(id);
  if (!s) throw Object.assign(new Error('session_not_found'), { status: 404 });
  return s;
};
const mustCredit = (id) => {
  const c = credit.getCredit(id);
  if (!c) throw Object.assign(new Error('credit_not_found'), { status: 404 });
  return c;
};

const ACCEPT_RE = /^\s*(s[ií],?\s*)?(acepto|i accept|accept|aceptar)\b/i;

/**
 * Punto de entrada de cada mensaje entrante.
 * body: { wa_id, name?, message_id?, type: 'text'|'audio'|'image'|'document'|..., text?, media_id?, mime? }
 */
r.post('/v1/inbound', wrap(async (req, res) => {
  const { wa_id, name, message_id, type = 'text', media_id, mime } = req.body;
  if (!wa_id) return res.status(400).json({ error: 'wa_id_required' });
  let text = req.body.text || '';
  let inputWasAudio = false;
  let detectedLang = null;

  if (type === 'audio' && media_id) {
    const media = await downloadMedia(media_id);
    const tr = await transcribe(media.buffer, media.mime);
    text = tr.text;
    detectedLang = tr.lang;
    inputWasAudio = true;
  }

  const { session: s0, isNew, refStatus } = sessions.claimSession({ waId: wa_id, text, name });
  let s = s0;
  const events = [];

  const switchTo = detectLangSwitch(text);
  if (switchTo && switchTo !== s.lang) { s = sessions.updateSession(s.id, { lang: switchTo }); events.push(`lang_${switchTo}`); }

  if (isNew && refStatus === 'ok') {
    await flow.startConversation(s.id);
    sessions.recordConsent(s.id, { type: 'privacy_notice_delivered', version: config.legal.privacyVersion, evidence: { message_id } });
    events.push('greeting_sent');
  }

  if (s.stage === 'credit_consent' && ACCEPT_RE.test(text)) {
    sessions.recordConsent(s.id, { type: 'credit_privacy', version: config.legal.creditPrivacyVersion, evidence: { message_id, text, audio: inputWasAudio } });
    s = sessions.updateSession(s.id, { stage: 'credit_collecting' });
    events.push('credit_privacy_accepted');
  }

  logEvent(inputWasAudio ? 'msg_in_audio' : 'msg_in', { sessionId: s.id });
  logMessage({
    sessionId: s.id, waId: wa_id, direction: 'in', author: 'customer', type,
    body: inputWasAudio ? `🎙️ ${text}` : text || (media_id ? `📎 ${type}` : ''),
  });
  const kyc = latestKyc(s.id);
  const td = testdrive.activeTestDrive(s.id);
  const vehicle = getVehicle(s.vehicle_id);
  const dealer = getDealer(s.dealer_id);
  const openCredit = credit.latestCreditForSession(s.id);

  res.json({
    session_id: s.id,
    is_new: isNew,
    ref_status: refStatus,
    bot_paused: Boolean(s.bot_paused),
    lang: s.lang,
    detected_lang: detectedLang,
    stage: s.stage,
    text,
    input_was_audio: inputWasAudio,
    reply_as_audio: inputWasAudio,
    media: type !== 'text' && type !== 'audio' && media_id ? { type, media_id, mime } : null,
    events,
    context: {
      customer_name: s.name,
      vehicle: vehicle ? { id: vehicle.id, name: loc(vehicle.name, s.lang) } : null,
      dealer: dealer ? { id: dealer.id, name: dealer.name, city: dealer.city, phone: dealer.phone, address: dealer.address } : null,
      credit: openCredit ? { id: openCredit.id, folio: openCredit.folio, bank_id: openCredit.bank_id, status: openCredit.status } : null,
      consents: sessions.listConsents(s.id).map((c) => c.type),
      kyc: kyc ? { status: kyc.status, doc_type: kyc.doc_type } : null,
      test_drive: td ? testdrive.describe(td, s.lang) : null,
      assigned_to: s.assigned_to,
      available_vehicles: vehicles.map((v) => ({ id: v.id, name: loc(v.name, s.lang) })),
    },
  });
}));

r.post('/v1/reply', wrap(async (req, res) => {
  const s = req.body.session_id ? mustSession(req.body.session_id) : sessions.latestSessionForWa(req.body.wa_id);
  if (!s) return res.status(404).json({ error: 'session_not_found' });
  if (!req.body.text) return res.status(400).json({ error: 'text_required' });
  const out = await flow.reply({ waId: s.wa_id, text: req.body.text, asAudio: Boolean(req.body.as_audio), lang: s.lang });
  logEvent(req.body.as_audio ? 'msg_out_audio' : 'msg_out', { sessionId: s.id });
  res.json(out);
}));

// --- Catálogo ----------------------------------------------------------------------------
r.get('/v1/vehicles', wrap(async (req, res) => res.json(await allVehicles(normLang(req.query.lang)))));
r.get('/v1/vehicles/:id', wrap(async (req, res) => {
  const info = await vehicleInfo(req.params.id, normLang(req.query.lang));
  return info ? res.json(info) : res.status(404).json({ error: 'vehicle_not_found' });
}));
r.get('/v1/banks', (req, res) => res.json(banks.map(({ email_to: _e, form_template: _f, ...b }) => b)));
r.post('/v1/simulate', (req, res) => {
  const bank = getBank(req.body.bank_id);
  if (!bank) return res.status(400).json({ error: 'unknown_bank' });
  const term = Number(req.body.term_months);
  if (!bank.terms_months.includes(term)) return res.status(400).json({ error: 'term_not_allowed', allowed: bank.terms_months });
  res.json(credit.simulate({ price: Number(req.body.price), downPayment: Number(req.body.down_payment), termMonths: term, ratePct: bank.rate_annual_pct, ivaOnInterest: bank.iva_on_interest }));
});

// --- Sesión ------------------------------------------------------------------------------
r.get('/v1/sessions/:id', (req, res) => {
  const s = mustSession(req.params.id);
  res.json({ ...s, consents: sessions.listConsents(s.id), kyc: latestKyc(s.id), credit: credit.latestCreditForSession(s.id)?.id ?? null });
});
r.patch('/v1/sessions/:id', (req, res) => {
  mustSession(req.params.id);
  const { lang, name, email, vehicle_id, stage } = req.body;
  if (vehicle_id && !getVehicle(vehicle_id)) return res.status(400).json({ error: 'unknown_vehicle' });
  res.json(sessions.updateSession(req.params.id, { lang, name, email, vehicle_id, stage }));
});
r.post('/v1/sessions/:id/handoff', wrap(async (req, res) => {
  const s = sessions.updateSession(mustSession(req.params.id).id, { bot_paused: 1 });
  logEvent('handoff', { sessionId: s.id, data: { reason: req.body.reason } });
  syncSession(s, { note: { title: '🙋 Cliente solicita asesor humano', body: req.body.reason || '' } }).catch((e) => console.warn('[crm]', e.message));
  const dealer = getDealer(s.dealer_id);
  res.json({ ok: true, dealer: dealer ? { name: dealer.name, phone: dealer.phone } : null });
}));
r.post('/v1/sessions/:id/resume-bot', (req, res) => res.json(sessions.updateSession(mustSession(req.params.id).id, { bot_paused: 0 })));
r.post('/v1/sessions/:id/crm-sync', wrap(async (req, res) => res.json(await syncSession(mustSession(req.params.id), { note: req.body.note }))));

// --- Crédito -----------------------------------------------------------------------------
r.post('/v1/sessions/:id/credit-privacy', wrap(async (req, res) => res.json(await flow.sendCreditPrivacy(mustSession(req.params.id).id))));
r.post('/v1/sessions/:id/kyc', wrap(async (req, res) => {
  const s = mustSession(req.params.id);
  if (!sessions.hasConsent(s.id, 'credit_privacy')) return res.status(409).json({ error: 'credit_privacy_consent_missing' });
  res.json(await flow.sendKycLink(s.id));
}));
r.get('/v1/sessions/:id/kyc', (req, res) => {
  const k = latestKyc(mustSession(req.params.id).id);
  res.json(k ? { id: k.id, status: k.status, doc_type: k.doc_type, updated_at: k.updated_at } : { status: 'not_started' });
});
r.post('/v1/sessions/:id/credit', (req, res) => {
  const c = flow.openCredit(mustSession(req.params.id).id, req.body.bank_id);
  res.json(credit.creditStatus(c.id));
});

// --- Prueba de manejo ---------------------------------------------------------------------
const dealerOf = (s) => s.dealer_id || dealers[0]?.id;
r.get('/v1/sessions/:id/test-drive/slots', (req, res) => {
  const s = mustSession(req.params.id);
  const slots = testdrive.availableSlots(dealerOf(s), { date: req.query.date || null, limit: Number(req.query.limit) || 8 });
  res.json(slots.map((x) => ({ starts_at: x.starts_at, date: x.local.date, time: x.local.time, spots_left: x.spots_left })));
});
r.post('/v1/sessions/:id/test-drive', wrap(async (req, res) => {
  const s = mustSession(req.params.id);
  if (req.body.vehicle_id) sessions.updateSession(s.id, { vehicle_id: req.body.vehicle_id });
  res.json(await flow.confirmTestDrive(s.id, req.body.starts_at));
}));
r.delete('/v1/sessions/:id/test-drive', (req, res) => {
  const td = testdrive.activeTestDrive(mustSession(req.params.id).id);
  if (!td) return res.status(404).json({ error: 'no_active_test_drive' });
  res.json(testdrive.setTestDriveStatus(td.id, 'cancelled'));
});
r.get('/v1/credit/:id', (req, res) => res.json(credit.creditStatus(mustCredit(req.params.id).id)));
r.patch('/v1/credit/:id', (req, res) => res.json(credit.updateCreditData(mustCredit(req.params.id).id, req.body.fields || req.body)));
r.post('/v1/credit/:id/documents', wrap(async (req, res) => {
  const c = mustCredit(req.params.id);
  if (!credit.DOCS[req.body.kind]) return res.status(400).json({ error: 'unknown_document_kind', allowed: Object.keys(credit.DOCS) });
  const media = await downloadMedia(req.body.media_id);
  if (media.buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'file_too_large' });
  const doc = credit.saveDocument({ sessionId: c.session_id, creditId: c.id, kind: req.body.kind, buffer: media.buffer, mime: media.mime, filename: req.body.filename });
  res.json({ document: doc, status: credit.creditStatus(c.id) });
}));
r.post('/v1/credit/:id/sign', wrap(async (req, res) => res.json(await flow.submitForSignature(mustCredit(req.params.id).id))));

// --- KYC (resultado del proveedor externo o del F&I) -------------------------------------
r.post('/v1/kyc/:id/result', requireAdmin, (req, res) => res.json(setKycResult(req.params.id, req.body.status, req.body.details)));

r.use((err, req, res, _next) => {
  if (!err.status || err.status >= 500) console.error('[api]', err);
  res.status(err.status || 500).json({ error: err.message, details: err.details });
});

export default r;
