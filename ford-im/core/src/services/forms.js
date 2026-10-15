// Genera las "planillas" en PDF: solicitud de crédito + autorización de consulta a Buró.
// Si el banco entrega su propio PDF con campos de formulario (AcroForm), se llena ese
// (banks.json → form_template) usando los mismos nombres de campo que FIELDS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FIELDS, DOCS } from './credit.js';
import { getBank, getVehicle, getDealer } from '../data/catalog.js';
import { loc } from '../lib/i18n.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FORD_BLUE = rgb(0, 0.035, 0.36);
// Las fuentes estándar de PDF usan WinAnsi: se descartan emojis y símbolos fuera de Latin-1.
const clean = (s) => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
const money = (n) => (typeof n === 'number' ? `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN` : '');

// Marcadores invisibles que DocuSign usa para colocar firma y fecha (anchor tabs).
export const ANCHORS = { sign: '\\s1\\', date: '\\d1\\', buroSign: '\\s2\\', buroDate: '\\d2\\' };

const SECTIONS = [
  ['Datos del solicitante', ['nombres', 'apellido_paterno', 'apellido_materno', 'fecha_nacimiento', 'curp', 'rfc', 'estado_civil', 'dependientes', 'email', 'telefono']],
  ['Domicilio', ['calle_numero', 'colonia', 'municipio', 'estado', 'cp', 'tipo_vivienda', 'anios_domicilio']],
  ['Empleo e ingresos', ['tipo_ingreso', 'empresa', 'puesto', 'antiguedad_laboral_anios', 'ingreso_mensual_mxn']],
  ['Referencias personales', ['ref1_nombre', 'ref1_telefono', 'ref1_relacion', 'ref2_nombre', 'ref2_telefono', 'ref2_relacion']],
];

export async function buildCreditPdf({ credit, session, status, documents }) {
  const bank = getBank(credit.bank_id);
  if (bank.form_template) return fillBankTemplate(bank, credit.data);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Solicitud de crédito ${credit.folio}`);
  pdf.setProducer('Ford IM – menteia.com');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page;
  let y;
  const W = 612;
  const H = 792;
  const M = 48;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 56, width: W, height: 56, color: FORD_BLUE });
    page.drawText('Ford IM', { x: M, y: H - 36, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText(clean(`Folio ${credit.folio}`), { x: W - M - 140, y: H - 36, size: 11, font, color: rgb(1, 1, 1) });
    y = H - 84;
  };
  const text = (s, { size = 10, f = font, color = rgb(0, 0, 0), x = M } = {}) => {
    if (y < 72) newPage();
    page.drawText(clean(s), { x, y, size, font: f, color });
    y -= size + 6;
  };
  const para = (s, size = 9) => {
    const words = clean(s).split(/\s+/);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > W - 2 * M) { text(line, { size }); line = w; } else line = test;
    }
    if (line) text(line, { size });
  };
  const row = (label, value) => {
    if (y < 72) newPage();
    page.drawText(clean(label), { x: M, y, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(clean(value), { x: M + 210, y, size: 10, font: bold });
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
    y -= 18;
  };
  const anchor = (s, x) => page.drawText(s, { x, y, size: 6, font, color: rgb(1, 1, 1) });

  const vehicle = getVehicle(session.vehicle_id);
  const dealer = getDealer(session.dealer_id);
  const today = new Date().toISOString().slice(0, 10);

  newPage();
  text('SOLICITUD DE CRÉDITO AUTOMOTRIZ', { size: 15, f: bold, color: FORD_BLUE });
  text(`Institución: ${bank.name}    Fecha: ${today}`, { size: 10 });
  text(`Distribuidor: ${dealer?.name ?? '-'}    Vehículo: ${vehicle ? loc(vehicle.name, 'es') : '-'} ${credit.data.version ?? ''}`, { size: 10 });
  y -= 6;

  text('Condiciones solicitadas', { size: 12, f: bold, color: FORD_BLUE });
  row('Precio del vehículo', money(credit.data.precio_vehiculo_mxn));
  row('Enganche', money(credit.data.enganche_mxn));
  row('Monto a financiar', money((credit.data.precio_vehiculo_mxn ?? 0) - (credit.data.enganche_mxn ?? 0)));
  row('Plazo', `${credit.data.plazo_meses ?? ''} meses`);
  if (status?.simulation) row('Mensualidad estimada (informativa)', money(status.simulation.monthly_payment));
  y -= 6;

  for (const [title, keys] of SECTIONS) {
    text(title, { size: 12, f: bold, color: FORD_BLUE });
    for (const k of keys) {
      const v = credit.data[k];
      row(FIELDS[k].label.es, FIELDS[k].type === 'money' ? money(v) : v ?? '');
    }
    y -= 6;
  }

  text('Documentos anexos', { size: 12, f: bold, color: FORD_BLUE });
  for (const d of documents) row(DOCS[d.kind]?.label.es ?? d.kind, `SHA-256 ${d.sha256.slice(0, 16)}...`);
  y -= 6;

  text('Declaraciones', { size: 12, f: bold, color: FORD_BLUE });
  para('Declaro bajo protesta de decir verdad que la información y documentación proporcionadas son verídicas y autorizo su verificación. ' +
    'Reconozco haber recibido y aceptado el Aviso de Privacidad para trámites de crédito y consiento expresamente el tratamiento de mis datos financieros y patrimoniales, ' +
    `así como su transferencia a ${bank.name} para la evaluación de esta solicitud. La presente solicitud no constituye aprobación de crédito.`);
  y -= 28;
  page.drawLine({ start: { x: M, y: y + 14 }, end: { x: M + 220, y: y + 14 }, thickness: 0.8 });
  anchor(ANCHORS.sign, M + 4);
  anchor(ANCHORS.date, M + 300);
  y -= 4;
  text('Firma del solicitante                                                         Fecha', { size: 9 });

  // Autorización para consulta de Sociedades de Información Crediticia
  newPage();
  text('AUTORIZACIÓN PARA SOLICITAR REPORTES DE CRÉDITO', { size: 14, f: bold, color: FORD_BLUE });
  text('Personas físicas', { size: 10 });
  y -= 6;
  const fullName = [credit.data.nombres, credit.data.apellido_paterno, credit.data.apellido_materno].filter(Boolean).join(' ');
  para(`Por este conducto autorizo expresamente a ${bank.name}, para que por conducto de sus funcionarios facultados lleve a cabo investigaciones ` +
    'sobre mi comportamiento crediticio en las Sociedades de Información Crediticia que estime conveniente. Así mismo, declaro que conozco la naturaleza y ' +
    `alcance de la información que se solicitará, del uso que ${bank.name} hará de tal información y de que ésta podrá realizar consultas periódicas de mi historial ` +
    'crediticio, consintiendo que esta autorización se encuentre vigente por un período de 3 (tres) años contados a partir de la fecha de su expedición y en todo ' +
    'caso durante el tiempo que mantengamos relación jurídica. Estoy consciente y acepto que este documento quede bajo propiedad de la institución y/o de la ' +
    'Sociedad de Información Crediticia consultada para efectos de control y cumplimiento del artículo 28 de la Ley para Regular las Sociedades de Información Crediticia.');
  y -= 8;
  row('Nombre', fullName);
  row('RFC', credit.data.rfc ?? '');
  row('CURP', credit.data.curp ?? '');
  row('Domicilio', [credit.data.calle_numero, credit.data.colonia, credit.data.municipio, credit.data.estado, credit.data.cp].filter(Boolean).join(', '));
  row('Lugar y fecha', `${credit.data.municipio ?? ''}, ${credit.data.estado ?? ''} – ${today}`);
  y -= 34;
  page.drawLine({ start: { x: M, y: y + 14 }, end: { x: M + 220, y: y + 14 }, thickness: 0.8 });
  anchor(ANCHORS.buroSign, M + 4);
  anchor(ANCHORS.buroDate, M + 300);
  y -= 4;
  text('Firma del solicitante                                                         Fecha', { size: 9 });

  return Buffer.from(await pdf.save());
}

async function fillBankTemplate(bank, data) {
  const file = path.resolve(here, '../data/forms', bank.form_template);
  const pdf = await PDFDocument.load(fs.readFileSync(file));
  const form = pdf.getForm();
  for (const field of form.getFields()) {
    const v = data[field.getName()];
    if (v !== undefined && typeof field.setText === 'function') field.setText(clean(v));
  }
  form.flatten();
  return Buffer.from(await pdf.save());
}
