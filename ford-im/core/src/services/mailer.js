// Envío de la solicitud firmada al banco con copia al cliente (y copia oculta al F&I del dealer).
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { esc } from '../lib/html.js';
import { DOCS } from './credit.js';

let transport;
const getTransport = () => {
  if (!transport) transport = config.mail.smtpUrl ? nodemailer.createTransport(config.mail.smtpUrl) : nodemailer.createTransport({ jsonTransport: true });
  return transport;
};

export async function sendToBank({ bank, credit, status, client, vehicleName, dealer, signedPdf, documents, decisionUrl, filesUrl }) {
  const asAttachments = config.mail.bankDeliveryMode === 'attachments';
  const attachments = [{ filename: `Solicitud-${credit.folio}-firmada.pdf`, content: signedPdf, contentType: 'application/pdf' }];
  let total = signedPdf.length;
  if (asAttachments) {
    for (const d of documents) {
      total += d.size;
      attachments.push({ filename: `${credit.folio}-${d.filename}`, content: fs.readFileSync(d.path), contentType: d.mime });
    }
    if (total > config.mail.maxAttachmentMb * 1024 * 1024) {
      throw Object.assign(new Error(`attachments_too_large (${Math.round(total / 1048576)} MB); usar BANK_DELIVERY_MODE=secure_link`), { status: 413 });
    }
  }

  const d = credit.data;
  const html = `
<div style="font-family:Arial,sans-serif;color:#111;max-width:640px">
  <div style="background:#00095B;color:#fff;padding:16px 20px;font-size:18px"><b>Ford IM</b> · Solicitud de crédito automotriz</div>
  <p>Estimado equipo de <b>${esc(bank.name)}</b>:</p>
  <p>Les compartimos la solicitud de crédito automotriz firmada electrónicamente, con la información y documentación precargada.</p>
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
    <tr><td><b>Folio</b></td><td>${esc(credit.folio)}</td></tr>
    <tr><td><b>Solicitante</b></td><td>${esc(client.name)} · ${esc(d.rfc)} · ${esc(d.email)} · ${esc(d.telefono)}</td></tr>
    <tr><td><b>Vehículo</b></td><td>${esc(vehicleName)} ${esc(d.version ?? '')}</td></tr>
    <tr><td><b>Precio / Enganche</b></td><td>$${Number(d.precio_vehiculo_mxn).toLocaleString('es-MX')} / $${Number(d.enganche_mxn).toLocaleString('es-MX')} MXN</td></tr>
    <tr><td><b>Plazo</b></td><td>${esc(d.plazo_meses)} meses</td></tr>
    <tr><td><b>Ingreso mensual declarado</b></td><td>$${Number(d.ingreso_mensual_mxn).toLocaleString('es-MX')} MXN (${esc(d.tipo_ingreso)})</td></tr>
    <tr><td><b>Distribuidor</b></td><td>${esc(dealer?.name ?? '')} · ${esc(dealer?.phone ?? '')}</td></tr>
  </table>
  <p><b>Anexos:</b> solicitud y autorización de consulta a SIC firmadas; ${documents.map((x) => esc(DOCS[x.kind]?.label.es ?? x.kind)).join('; ')}.</p>
  ${asAttachments ? '' : `<p>Por seguridad, los documentos de identidad se comparten por liga con caducidad: <a href="${esc(filesUrl)}">descargar expediente</a></p>`}
  <p style="margin:24px 0"><a href="${esc(decisionUrl)}" style="background:#00095B;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px">Registrar dictamen del banco</a></p>
  <p style="font-size:12px;color:#666">Puede también responder a este correo. Este mensaje contiene datos personales y financieros tratados conforme a la LFPDPPP; si lo recibió por error, elimínelo y avise a ${esc(config.legal.privacyEmail)}.</p>
</div>`;

  return getTransport().sendMail({
    from: config.mail.from,
    to: config.mail.bankEmailOverride || bank.email_to,
    cc: client.email,
    bcc: [...config.mail.bccDealer, ...(dealer?.fi_email ? [dealer.fi_email] : [])],
    replyTo: dealer?.fi_email || undefined,
    subject: `${config.demoMode ? '[DEMO] ' : ''}Solicitud de crédito automotriz – ${client.name} – ${vehicleName} – Folio ${credit.folio}`,
    html,
    attachments,
  });
}
