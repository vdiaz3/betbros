// Genera public/media/pdf/ficha-tecnica-<id>.pdf a partir de src/data/specs.json.
// Son fichas de REFERENCIA para el demo; la oficial de Ford México las sustituye.
//   npm run build:datasheets
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specs = JSON.parse(fs.readFileSync(path.join(root, 'src/data/specs.json'), 'utf8'));
const { vehicles } = JSON.parse(fs.readFileSync(path.join(root, 'src/data/vehicles.json'), 'utf8'));
const logo = fs.readFileSync(path.join(root, 'public/kiosk/assets/ford-logo.png'));
const NAVY = rgb(0, 0.035, 0.36);
const GRAY = rgb(0.4, 0.42, 0.47);
const LABELS = {
  anio_modelo: 'Año modelo', versiones: 'Versiones', motor: 'Motor', transmision: 'Transmisión', traccion: 'Tracción',
  rendimiento: 'Rendimiento de combustible', dimensiones: 'Dimensiones', capacidad: 'Capacidad (pasajeros / carga)',
  seguridad: 'Seguridad y asistencias', garantia: 'Garantía',
};

const wrap = (font, text, size, width) => {
  const out = [];
  let line = '';
  for (const w of String(text).split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
};

for (const v of vehicles) {
  const data = specs.vehicles[v.id];
  if (!data) continue;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Ficha técnica – ${v.name.es} (referencia)`);
  pdf.setProducer('Ford IM – menteia.com');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const img = await pdf.embedPng(logo);
  const page = pdf.addPage([612, 792]);
  const M = 48;
  page.drawRectangle({ x: 0, y: 692, width: 612, height: 100, color: NAVY });
  page.drawImage(img, { x: M, y: 717, width: 116, height: 50 });
  page.drawText('FICHA TÉCNICA', { x: 190, y: 750, size: 12, font: bold, color: rgb(0.8, 0.86, 1) });
  page.drawText(v.name.es, { x: 190, y: 722, size: 28, font: bold, color: rgb(1, 1, 1) });
  page.drawText(v.tagline.es, { x: M, y: 662, size: 13, font, color: GRAY });

  let y = 630;
  for (const [k, label] of Object.entries(LABELS)) {
    const lines = wrap(font, data[k] ?? 'Por confirmar', 10.5, 330);
    page.drawText(label, { x: M, y, size: 10.5, font: bold, color: NAVY });
    lines.forEach((ln, i) => page.drawText(ln, { x: 230, y: y - i * 14, size: 10.5, font, color: /Por confirmar/.test(ln) ? GRAY : rgb(0, 0, 0) }));
    y -= Math.max(1, lines.length) * 14 + 14;
    page.drawLine({ start: { x: M, y: y + 15 }, end: { x: 564, y: y + 15 }, thickness: 0.4, color: rgb(0.85, 0.86, 0.9) });
  }

  // Aviso de referencia
  page.drawRectangle({ x: M, y: 92, width: 516, height: 70, color: rgb(1, 0.97, 0.86) });
  const note = 'Información de referencia para demostración, tomada de fuentes públicas no oficiales. No constituye oferta. Precios, versiones y especificaciones pueden cambiar; consulte la ficha oficial de Ford México o a su distribuidor autorizado.';
  wrap(font, note, 9, 496).forEach((ln, i) => page.drawText(ln, { x: M + 10, y: 146 - i * 12, size: 9, font, color: rgb(0.42, 0.3, 0) }));
  page.drawText(`Fuentes: ${specs.fuentes.map((u) => new URL(u).hostname).join(' · ')}`, { x: M, y: 60, size: 7.5, font, color: GRAY });
  page.drawText('Ford IM · cotizador.menteia.com', { x: M, y: 44, size: 7.5, font, color: GRAY });

  const out = path.join(root, 'public/media', v.datasheet_pdf);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await pdf.save({ useObjectStreams: false }));
  console.log('OK', out);
}
