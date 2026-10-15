// Genera src/data/forms/bbva-demo.pdf: formulario de solicitud de crédito automotriz CON CAMPOS
// (AcroForm) para la demostración con BBVA. Ford IM lo llena con los datos del cliente y lo envía
// a firma en DocuSign. Es un formato de DEMOSTRACIÓN, no el formato oficial del banco: cuando
// BBVA entregue su PDF oficial con campos, basta con mapear los nombres de campo.
//   node scripts/build-demo-form.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data/forms/bbva-demo.pdf');
const NAVY = rgb(0.03, 0.16, 0.4);
const GRAY = rgb(0.4, 0.42, 0.47);

const pdf = await PDFDocument.create();
pdf.setTitle('Solicitud de Crédito Automotriz – DEMO');
pdf.setProducer('Ford IM – menteia.com');
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const form = pdf.getForm();
const W = 612, H = 792, M = 40;
let page, y;

function newPage(title) {
  page = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: NAVY });
  page.drawText(title, { x: M, y: H - 32, size: 15, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Formato de demostración – Ford IM', { x: M, y: H - 50, size: 9, font, color: rgb(0.8, 0.86, 1) });
  page.drawText('DEMO', { x: 150, y: 300, size: 160, font: bold, color: rgb(0.93, 0.94, 0.97), rotate: degrees(35) });
  page.drawText('Documento de demostración generado por Ford IM. No es un formato oficial de la institución financiera ni constituye oferta de crédito.',
    { x: M, y: 22, size: 7, font, color: GRAY });
  y = H - 92;
}
function section(t) {
  y -= 6;
  page.drawText(t.toUpperCase(), { x: M, y, size: 9.5, font: bold, color: NAVY });
  page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 1, color: NAVY });
  y -= 28;
}
// Fila de campos: [[nombre, etiqueta, fracción de ancho], ...]
function fields(row) {
  let x = M;
  const total = W - 2 * M;
  for (const [name, label, frac] of row) {
    const w = total * frac - 6;
    page.drawText(label, { x, y: y + 15, size: 6.5, font, color: GRAY });
    const f = form.createTextField(name);
    f.addToPage(page, { x, y, width: w, height: 14, font, borderColor: rgb(0.8, 0.82, 0.88), borderWidth: 0.6, backgroundColor: rgb(0.97, 0.98, 1) });
    f.setFontSize(8.5);
    x += w + 6;
  }
  y -= 27;
}
const anchor = (s, x, yy) => page.drawText(s, { x, y: yy, size: 6, font, color: rgb(1, 1, 1) });

newPage('SOLICITUD DE CRÉDITO AUTOMOTRIZ');
fields([['banco', 'Institución financiera', 0.4], ['folio', 'Folio', 0.3], ['fecha', 'Fecha', 0.3]]);
fields([['distribuidor', 'Distribuidor', 0.5], ['vehiculo', 'Vehículo y versión', 0.5]]);
section('Condiciones solicitadas');
fields([['precio_vehiculo_mxn', 'Precio del vehículo', 0.25], ['enganche_mxn', 'Enganche', 0.25], ['monto_financiar', 'Monto a financiar', 0.25], ['plazo_meses', 'Plazo (meses)', 0.25]]);
fields([['tasa', 'Tasa anual de referencia', 0.33], ['mensualidad', 'Mensualidad estimada (informativa)', 0.34], ['kyc', 'Verificación de identidad', 0.33]]);
section('Datos del solicitante');
fields([['nombres', 'Nombre(s)', 0.4], ['apellido_paterno', 'Apellido paterno', 0.3], ['apellido_materno', 'Apellido materno', 0.3]]);
fields([['fecha_nacimiento', 'Fecha de nacimiento', 0.2], ['curp', 'CURP', 0.3], ['rfc', 'RFC', 0.2], ['estado_civil', 'Estado civil', 0.18], ['dependientes', 'Dependientes', 0.12]]);
fields([['email', 'Correo electrónico', 0.5], ['telefono', 'Teléfono', 0.5]]);
section('Domicilio');
fields([['calle_numero', 'Calle y número', 0.5], ['colonia', 'Colonia', 0.5]]);
fields([['municipio', 'Municipio / Alcaldía', 0.3], ['estado', 'Estado', 0.25], ['cp', 'C.P.', 0.15], ['tipo_vivienda', 'Vivienda', 0.15], ['anios_domicilio', 'Años', 0.15]]);
section('Empleo e ingresos');
fields([['tipo_ingreso', 'Tipo de ingreso', 0.25], ['empresa', 'Empresa / Actividad', 0.45], ['puesto', 'Puesto', 0.3]]);
fields([['antiguedad_laboral_anios', 'Antigüedad (años)', 0.3], ['ingreso_mensual_mxn', 'Ingreso mensual neto', 0.7]]);
fields([['anexos', 'Documentos anexos', 1]]);
section('Referencias personales');
fields([['ref1_nombre', 'Referencia 1', 0.45], ['ref1_telefono', 'Teléfono', 0.3], ['ref1_relacion', 'Relación', 0.25]]);
fields([['ref2_nombre', 'Referencia 2', 0.45], ['ref2_telefono', 'Teléfono', 0.3], ['ref2_relacion', 'Relación', 0.25]]);
section('Declaraciones');
const decl = 'Declaro bajo protesta de decir verdad que la información y documentos proporcionados son verídicos y autorizo su verificación. Reconozco haber recibido el Aviso de Privacidad para trámites de crédito y consiento expresamente el tratamiento de mis datos financieros y patrimoniales y su transferencia a la institución financiera indicada para evaluar esta solicitud, la cual no constituye aprobación de crédito.';
for (const line of decl.match(/.{1,125}(\s|$)/g)) { page.drawText(line.trim(), { x: M, y, size: 7.5, font }); y -= 11; }
y -= 26;
page.drawLine({ start: { x: M, y }, end: { x: M + 230, y }, thickness: 0.8 });
page.drawLine({ start: { x: W - M - 160, y }, end: { x: W - M, y }, thickness: 0.8 });
anchor('\\s1\\', M + 4, y + 6);
anchor('\\d1\\', W - M - 150, y + 6);
page.drawText('Firma del solicitante', { x: M, y: y - 12, size: 8, font });
page.drawText('Fecha', { x: W - M - 160, y: y - 12, size: 8, font });

newPage('AUTORIZACIÓN PARA SOLICITAR REPORTES DE CRÉDITO');
y -= 6;
fields([['banco_buro', 'Institución autorizada', 1]]);
const buro = 'Por este conducto autorizo expresamente a la institución financiera arriba indicada para que por conducto de sus funcionarios facultados lleve a cabo investigaciones sobre mi comportamiento crediticio en las Sociedades de Información Crediticia que estime conveniente. Así mismo, declaro que conozco la naturaleza y alcance de la información que se solicitará, del uso que dicha institución hará de tal información y de que ésta podrá realizar consultas periódicas de mi historial crediticio, consintiendo que esta autorización se encuentre vigente por un período de 3 (tres) años contados a partir de la fecha de su expedición y en todo caso durante el tiempo que mantengamos relación jurídica. Estoy consciente y acepto que este documento quede bajo propiedad de la institución y/o de la Sociedad de Información Crediticia consultada para efectos de control y cumplimiento del artículo 28 de la Ley para Regular las Sociedades de Información Crediticia.';
for (const line of buro.match(/.{1,118}(\s|$)/g)) { page.drawText(line.trim(), { x: M, y, size: 8.5, font }); y -= 13; }
y -= 12;
fields([['nombre_completo', 'Nombre completo', 0.6], ['rfc_buro', 'RFC', 0.4]]);
fields([['domicilio_completo', 'Domicilio', 1]]);
fields([['lugar_fecha', 'Lugar y fecha', 0.6], ['curp_buro', 'CURP', 0.4]]);
y -= 40;
page.drawLine({ start: { x: M, y }, end: { x: M + 230, y }, thickness: 0.8 });
page.drawLine({ start: { x: W - M - 160, y }, end: { x: W - M, y }, thickness: 0.8 });
anchor('\\s2\\', M + 4, y + 6);
anchor('\\d2\\', W - M - 150, y + 6);
page.drawText('Firma del solicitante', { x: M, y: y - 12, size: 8, font });
page.drawText('Fecha', { x: W - M - 160, y: y - 12, size: 8, font });

fs.writeFileSync(out, await pdf.save({ useObjectStreams: false }));
console.log('OK', out, form.getFields().length, 'campos');
