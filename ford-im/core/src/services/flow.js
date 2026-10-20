// Orquestación de los pasos "deterministas" del recorrido (los que no decide la IA):
// bienvenida + aviso + video, avisos de privacidad, firma, envío al banco y dictamen.
import { config, publicUrl, mediaUrl } from '../config.js';
import { getVehicle, getDealer, getBank, featuredReview } from '../data/catalog.js';
import { t, loc } from '../lib/i18n.js';
import { signToken } from '../lib/token.js';
import { logEvent } from '../db.js';
import * as wa from './whatsapp.js';
import { getSession, updateSession, hasConsent, onStageChange } from './sessions.js';
import { getCredit, creditStatus, listDocuments, setCreditStatus, saveDocument, startCredit, updateCreditData } from './credit.js';
import { buildCreditPdf } from './forms.js';
import * as docusign from './docusign.js';
import { sendToBank } from './mailer.js';
import { syncSession } from './crm.js';
import { startKyc, isKycApproved, attachKycDocsToCredit, latestKyc } from './kyc.js';
import { bookTestDrive, describe as describeTestDrive } from './testdrive.js';
import { synthesize, splitForVoice } from './voice.js';

const legalUrl = (doc, lang) => publicUrl('legal', `/${doc}?lang=${lang}`);

const crmSafe = (session, note) =>
  syncSession(session, { note }).catch((err) => console.warn('[crm]', err.message));

// Cada cambio de etapa mueve la oportunidad en el pipeline del CRM.
onStageChange((s) => crmSafe(s));

export async function startConversation(sessionId) {
  const s = getSession(sessionId);
  const vehicle = getVehicle(s.vehicle_id);
  const dealer = getDealer(s.dealer_id);
  const vars = {
    name: s.name?.split(' ')[0],
    vehicle: vehicle ? loc(vehicle.name, s.lang) : 'Ford',
    dealer: dealer?.name ?? 'Ford',
    privacyUrl: legalUrl('privacidad', s.lang),
  };
  await wa.sendText(s.wa_id, t(s.lang, 'welcome', vars));
  if (vehicle?.video_url) await wa.sendVideo(s.wa_id, mediaUrl(vehicle.video_url), t(s.lang, 'videoCaption', vars));
  if (featuredReview) await wa.sendText(s.wa_id, t(s.lang, 'review', featuredReview));
  logEvent('greeting_sent', { sessionId, data: { privacy_version: config.legal.privacyVersion } });
  crmSafe(s, { title: 'Lead desde kiosco', body: `Escaneó el QR del ${vars.vehicle} en ${dealer?.name ?? '-'} (kiosco ${s.kiosk_id ?? '-'}).` });
  return { sent: ['welcome', vehicle?.video_url ? 'video' : null, featuredReview ? 'review' : null].filter(Boolean) };
}

// Respuesta del agente: en texto o como nota de voz (si el cliente habló por audio).
export async function reply({ waId, text, asAudio, lang }) {
  if (asAudio && (wa.transport() !== 'cloud' || !config.elevenlabs.apiKey)) asAudio = false; // voz no disponible → texto
  if (!asAudio) return { sent: [await wa.sendText(waId, text, 'bot')] };
  const { spoken, links } = splitForVoice(text);
  const ogg = await synthesize(spoken, lang);
  const media = await wa.uploadMedia(ogg, 'audio/ogg', 'respuesta.ogg');
  const sent = [await wa.sendAudioId(waId, media.id, 'bot', spoken)];
  if (links.length) sent.push(await wa.sendText(waId, links.join('\n'), 'bot'));
  return { sent };
}

export async function sendCreditPrivacy(sessionId) {
  const s = updateSession(sessionId, { stage: 'credit_consent' });
  await wa.sendText(s.wa_id, t(s.lang, 'creditPrivacy', { url: legalUrl('privacidad-credito', s.lang) }));
  return { sent: true };
}

export async function sendKycLink(sessionId) {
  const s = updateSession(sessionId, { stage: 'kyc' });
  const kyc = startKyc(sessionId);
  const token = signToken('kyc', { k: kyc.id, l: s.lang }, config.kyc.linkTtlHours * 3600);
  const url = publicUrl('kyc', `/k/${token}`);
  await wa.sendText(s.wa_id, t(s.lang, 'kycLink', { url }));
  return { kyc_id: kyc.id, url };
}

export async function submitForSignature(creditId) {
  const credit = getCredit(creditId);
  const s = getSession(credit.session_id);
  if (!hasConsent(s.id, 'credit_privacy')) throw Object.assign(new Error('credit_privacy_consent_missing'), { status: 409 });
  const status = creditStatus(creditId);
  if (!status.ready) throw Object.assign(new Error('credit_not_ready'), { status: 409, details: status });

  const pdf = await buildCreditPdf({ credit, session: s, status, documents: listDocuments(creditId) });
  saveDocument({ sessionId: s.id, creditId, kind: 'solicitud', buffer: pdf, mime: 'application/pdf', filename: 'solicitud.pdf' });
  const signer = signerFor(credit);
  let envelopeId = `dry-run-${credit.id}`;
  if (docusign.docusignEnabled()) {
    envelopeId = await docusign.createEnvelope({ credit, signer, pdf, webhookUrl: publicUrl('firma', '/webhook'), lang: s.lang });
  }
  setCreditStatus(creditId, 'signing', { envelope_id: envelopeId });
  updateSession(s.id, { stage: 'signing', email: credit.data.email });

  const token = signToken('sign', { c: creditId }, 7 * 86400);
  const url = publicUrl('firma', `/s/${token}`);
  const bank = getBank(credit.bank_id);
  await wa.sendText(s.wa_id, t(s.lang, 'signLink', { url, bank: bank.name }));
  crmSafe(getSession(s.id), { title: `Solicitud ${credit.folio} enviada a firma`, body: `Banco: ${bank.name}` });
  return { envelope_id: envelopeId, url };
}

export function signerFor(credit) {
  const d = credit.data;
  return {
    email: d.email,
    name: [d.nombres, d.apellido_paterno, d.apellido_materno].filter(Boolean).join(' '),
    clientUserId: credit.session_id,
  };
}

// Llamado por DocuSign Connect cuando el sobre se completa.
export async function onEnvelopeCompleted(credit) {
  if (credit.status !== 'signing') return { skipped: credit.status };
  const s = getSession(credit.session_id);
  const bank = getBank(credit.bank_id);
  const dealer = getDealer(s.dealer_id);
  const vehicle = getVehicle(s.vehicle_id);
  const signedPdf = docusign.docusignEnabled()
    ? await docusign.downloadCombined(credit.envelope_id)
    : await buildCreditPdf({ credit, session: s, status: creditStatus(credit.id), documents: listDocuments(credit.id) });
  saveDocument({ sessionId: s.id, creditId: credit.id, kind: 'solicitud_firmada', buffer: signedPdf, mime: 'application/pdf', filename: 'solicitud_firmada.pdf' });

  const decisionToken = signToken('bank', { c: credit.id }, 60 * 86400);
  const filesToken = signToken('files', { c: credit.id }, 15 * 86400);
  const docs = listDocuments(credit.id).filter((d) => !['solicitud', 'solicitud_firmada'].includes(d.kind));
  await sendToBank({
    bank, credit, client: signerFor(credit), vehicleName: vehicle ? loc(vehicle.name, 'es') : 'Ford', dealer,
    signedPdf, documents: docs,
    decisionUrl: publicUrl('bancos', `/r/${decisionToken}`),
    filesUrl: publicUrl('bancos', `/f/${filesToken}`),
  });
  setCreditStatus(credit.id, 'sent_to_bank');
  updateSession(s.id, { stage: 'sent_to_bank' });
  logEvent('sent_to_bank', { sessionId: s.id, data: { bank: bank.id, folio: credit.folio } });
  await notify(s, 'sentToBank', { bank: bank.name, folio: credit.folio }, config.whatsapp.templates.signatureDone, [bank.name, credit.folio]);
  crmSafe(getSession(s.id), { title: `Solicitud ${credit.folio} enviada a ${bank.name}`, body: 'Firmada en DocuSign y enviada por correo con copia al cliente.' });
  return { sent: true };
}

export async function onBankDecision(creditId, decision) {
  const credit = getCredit(creditId);
  if (!['sent_to_bank', 'bank_more_info'].includes(credit.status)) throw Object.assign(new Error('credit_not_awaiting_decision'), { status: 409 });
  const map = { approved: 'bank_approved', rejected: 'bank_rejected', more_info: 'bank_more_info' };
  const stage = map[decision.status];
  if (!stage) throw Object.assign(new Error('invalid_decision'), { status: 400 });
  setCreditStatus(creditId, stage, { decision: { ...decision, at: Date.now() } });
  const s = updateSession(credit.session_id, { stage });
  const bank = getBank(credit.bank_id);
  const vars = { bank: bank.name, folio: credit.folio, notes: decision.notes || '-' };
  await notify(s, `decision.${decision.status}`, vars, config.whatsapp.templates.bankDecision, [bank.name, credit.folio, decision.status]);
  crmSafe(s, { title: `Dictamen ${bank.name}: ${decision.status}`, body: JSON.stringify(decision, null, 2) });
  return { ok: true, stage };
}

// Dentro de la ventana de 24 h se manda texto libre; fuera de ella, sólo plantilla aprobada.
async function notify(session, key, vars, template, params) {
  try {
    await wa.sendText(session.wa_id, t(session.lang, key, vars));
  } catch (err) {
    console.warn('[notify] texto rechazado, usando plantilla', err.message);
    await wa.sendTemplate(session.wa_id, template, session.lang, params);
  }
}

export async function confirmTestDrive(sessionId, startsAt) {
  const td = bookTestDrive(sessionId, startsAt);
  const s = getSession(sessionId);
  const d = describeTestDrive(td, s.lang);
  const dealer = getDealer(td.dealer_id);
  const text = s.lang === 'en'
    ? `🚗 Your test drive is booked!\n*${d.vehicle}* · ${d.when}\n📍 ${dealer?.name}, ${dealer?.address}${dealer?.maps_url ? `\n${dealer.maps_url}` : ''}\n📅 Add to calendar: ${d.calendar_url}\nBring your driver's license. We'll send you a reminder the day before.`
    : `🚗 ¡Tu prueba de manejo quedó agendada!\n*${d.vehicle}* · ${d.when}\n📍 ${dealer?.name}, ${dealer?.address}${dealer?.maps_url ? `\n${dealer.maps_url}` : ''}\n📅 Agrégala a tu calendario: ${d.calendar_url}\nTrae tu licencia de manejo vigente. Te mandaremos un recordatorio un día antes.`;
  await wa.sendText(s.wa_id, text);
  crmSafe(getSession(sessionId), { title: `🚗 Prueba de manejo: ${d.vehicle}`, body: d.when });
  return d;
}

// La solicitud de crédito sólo se abre con consentimiento expreso y KYC aprobado. La
// identificación del KYC se adjunta sola y la CURP verificada se precarga.
export function openCredit(sessionId, bankId) {
  if (!hasConsent(sessionId, 'credit_privacy')) throw Object.assign(new Error('credit_privacy_consent_missing'), { status: 409 });
  if (!isKycApproved(sessionId)) throw Object.assign(new Error('kyc_required'), { status: 409, details: { kyc: latestKyc(sessionId)?.status ?? 'not_started' } });
  const c = startCredit(sessionId, bankId);
  attachKycDocsToCredit(sessionId, c.id);
  const kyc = latestKyc(sessionId);
  if (kyc?.curp && !c.data.curp) updateCreditData(c.id, { curp: kyc.curp });
  const s = getSession(sessionId);
  if (['chatting', 'test_drive_booked', 'credit_consent', 'kyc'].includes(s.stage)) updateSession(sessionId, { stage: 'credit_collecting' });
  return c;
}
