// QR rotativo: cada kiosco pide un token nuevo cada 30 s. El QR codifica una URL corta
// (https://go.menteia.com/q/XXXXXXXX), lo que mantiene el código en versión 3–4 y permite
// corrección de errores H (30 %) con el logo de Ford al centro sin perder legibilidad.
//
// Nota: los códigos "de ondas" estilo App Clip / Apple Pay son formatos propietarios que la
// cámara nativa de Android no lee. Aquí se usa un QR estándar dibujado con puntos redondos,
// dentro de un círculo con anillos concéntricos decorativos (fuera de la zona de silencio).
import QRCode from 'qrcode';
import AlignmentPattern from 'qrcode/lib/core/alignment-pattern.js';
import { getDb, now, shortCode } from '../db.js';
import { config, publicUrl } from '../config.js';
import { getKiosk, getVehicle } from '../data/catalog.js';
import { normLang } from '../lib/i18n.js';

export function issueQrToken({ kioskId, vehicleId, lang }) {
  const kiosk = getKiosk(kioskId);
  if (!kiosk) throw Object.assign(new Error('unknown_kiosk'), { status: 404 });
  if (!getVehicle(vehicleId)) throw Object.assign(new Error('unknown_vehicle'), { status: 404 });
  const id = shortCode(8);
  const t = now();
  const ttl = (config.qr.rotateSeconds + config.qr.graceSeconds) * 1000;
  getDb()
    .prepare(
      'INSERT INTO qr_tokens (id, kiosk_id, dealer_id, vehicle_id, lang, created_at, expires_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run(id, kioskId, kiosk.dealer_id, vehicleId, normLang(lang), t, t + ttl);
  // Limpieza oportunista de tokens viejos (> 1 día).
  getDb().prepare('DELETE FROM qr_tokens WHERE expires_at < ?').run(t - 86_400_000);
  return {
    token: id,
    url: publicUrl('go', `/q/${id}`),
    rotateInMs: config.qr.rotateSeconds * 1000,
    expiresAt: t + ttl,
  };
}

// Devuelve la fila del token si sigue vigente; null si no existe o expiró.
export function redeemQrToken(id) {
  const row = getDb().prepare('SELECT * FROM qr_tokens WHERE id = ?').get(String(id || ''));
  if (!row || row.expires_at < now()) return null;
  getDb().prepare('UPDATE qr_tokens SET scans = scans + 1 WHERE id = ?').run(row.id);
  return row;
}

// --- Render SVG --------------------------------------------------------------------------

const f = (n) => Math.round(n * 100) / 100;

function inFinder(r, c, n) {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
}

export function renderQrSvg(text, { color = '#00095B', logoHref = '/kiosk/assets/ford-logo.svg' } = {}) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const S = 1000;
  const c0 = S / 2;
  const qrSide = 500;
  const m = qrSide / n;
  const x0 = c0 - qrSide / 2;
  const y0 = c0 - qrSide / 2;

  // Hueco central para el logo: ~24 % del lado del QR (≈ 6 % de los módulos con ECC H).
  const logoR = qrSide * 0.13;
  const inLogo = (r, c) => {
    const cx = x0 + (c + 0.5) * m - c0;
    const cy = y0 + (r + 0.5) * m - c0;
    return Math.hypot(cx, cy) < logoR + m * 0.6;
  };

  // Patrones de alineación (5×5): se dibujan sólidos, como los de posición. Partidos en
  // puntos, algunos lectores no los detectan en tamaños grandes.
  const aligns = AlignmentPattern.getPositions(qr.version).filter(([r, c]) => !inFinder(r, c, n) && !inLogo(r, c));
  const inAlign = (r, c) => aligns.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2);

  const dots = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c) || inFinder(r, c, n) || inAlign(r, c) || inLogo(r, c)) continue;
      dots.push(`<circle cx="${f(x0 + (c + 0.5) * m)}" cy="${f(y0 + (r + 0.5) * m)}" r="${f(m * 0.47)}"/>`);
    }
  }

  const finder = (r, c) => {
    const x = x0 + c * m;
    const y = y0 + r * m;
    return (
      `<rect x="${f(x + m / 2)}" y="${f(y + m / 2)}" width="${f(6 * m)}" height="${f(6 * m)}" rx="${f(1.8 * m)}" fill="none" stroke="${color}" stroke-width="${f(m)}"/>` +
      `<rect x="${f(x + 2 * m)}" y="${f(y + 2 * m)}" width="${f(3 * m)}" height="${f(3 * m)}" rx="${f(0.9 * m)}" fill="${color}"/>`
    );
  };

  const align = ([r, c]) => {
    const x = x0 + (c - 2) * m;
    const y = y0 + (r - 2) * m;
    return (
      `<rect x="${f(x + m / 2)}" y="${f(y + m / 2)}" width="${f(4 * m)}" height="${f(4 * m)}" rx="${f(1.2 * m)}" fill="none" stroke="${color}" stroke-width="${f(m)}"/>` +
      `<rect x="${f(x + 2 * m)}" y="${f(y + 2 * m)}" width="${f(m)}" height="${f(m)}" rx="${f(0.3 * m)}" fill="${color}"/>`
    );
  };

  // Anillos concéntricos decorativos: empiezan fuera del cuadrado del QR + 2 módulos de silencio.
  const rings = [];
  const rStart = (qrSide / 2 + 2.5 * m) * Math.SQRT2;
  const rEnd = S / 2 - m;
  let k = 0;
  for (let rr = rStart; rr <= rEnd; rr += m * 1.25, k++) {
    const count = Math.floor((2 * Math.PI * rr) / (m * 1.25));
    const phase = (k % 2) * (Math.PI / count);
    const op = f(0.85 - (k * 0.18));
    for (let i = 0; i < count; i++) {
      const a = (2 * Math.PI * i) / count + phase;
      // Patrón tipo "onda": el radio de cada punto oscila suavemente.
      const rad = m * (0.28 + 0.14 * (1 + Math.sin(a * 6 + k)) / 2);
      rings.push(`<circle cx="${f(c0 + rr * Math.cos(a))}" cy="${f(c0 + rr * Math.sin(a))}" r="${f(rad)}" opacity="${op}"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="QR">
<circle cx="${c0}" cy="${c0}" r="${S / 2}" fill="#fff"/>
<g fill="${color}">${rings.join('')}</g>
<g fill="${color}">${dots.join('')}</g>
${finder(0, 0)}${finder(0, n - 7)}${finder(n - 7, 0)}${aligns.map(align).join('')}
<circle cx="${c0}" cy="${c0}" r="${f(logoR)}" fill="#fff"/>
<image href="${logoHref}" x="${f(c0 - logoR * 0.92)}" y="${f(c0 - logoR * 0.92)}" width="${f(logoR * 1.84)}" height="${f(logoR * 1.84)}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}
