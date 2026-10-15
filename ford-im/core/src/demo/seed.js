// Datos FICTICIOS para el demo: leads en todas las etapas, conversaciones, pruebas de manejo,
// KYC y solicitudes de crédito, repartidos en los últimos 30 días. Sólo se usa con DEMO_SEED=true
// (al arrancar, si la base está vacía) o con `npm run seed:demo`.
import { getDb, uid, shortCode } from '../db.js';
import { vehicles, kiosks, banks } from '../data/catalog.js';

const FIRST = ['Ana', 'Luis', 'María', 'Jorge', 'Fernanda', 'Carlos', 'Daniela', 'Ricardo', 'Sofía', 'Miguel', 'Valeria', 'Alejandro', 'Paola', 'Diego', 'Gabriela', 'Héctor', 'Lucía', 'Andrés', 'Mariana', 'Roberto'];
const LAST = ['García', 'Hernández', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales'];

// Generador pseudoaleatorio con semilla: el demo siempre se ve igual.
function rng(seed) {
  let x = seed;
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const CHATS = {
  es: [
    ['in', 'customer', 'Hola 👋 Quiero información del {v}. (ref: {ref})'],
    ['out', 'system', '¡Hola {n}! Soy el asistente virtual de Ford Demo Distribuidor 🚙 Te comparto un video del *{v}*. 🔒 Aviso de privacidad: https://cotizador.menteia.com/legal/privacidad?lang=es'],
    ['out', 'system', '🎬 {v} en 30 segundos'],
    ['in', 'customer', '🎙️ ¿Qué versiones tienen y cuánto cuesta la más equipada?'],
    ['out', 'bot', '🎙️ El {v} tiene tres versiones. La más equipada incluye asistencias de manejo, pantalla de 12 pulgadas y tracción 4x4. ¿Te gustaría que te calcule una mensualidad?'],
    ['in', 'customer', 'Sí, con 20% de enganche a 48 meses'],
    ['out', 'bot', 'Con 20 % de enganche a 48 meses, la mensualidad estimada con BBVA México es de *$17,850* (informativa, sin CAT ni seguros). ¿Quieres agendar una prueba de manejo o iniciar tu solicitud de crédito?'],
  ],
};

export function seedDemo({ force = false } = {}) {
  const db = getDb();
  if (!force && db.prepare('SELECT COUNT(*) n FROM sessions').get().n > 0) return { skipped: true };
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();
  const DAY = 86_400_000;
  const kiosk = kiosks[0];
  const bank = banks[0];
  const ev = db.prepare('INSERT INTO events (session_id, kiosk_id, type, data_json, created_at) VALUES (?,?,?,?,?)');
  const msg = db.prepare('INSERT INTO messages (session_id, wa_id, direction, author, type, body, created_at) VALUES (?,?,?,?,?,?,?)');
  const counts = { scans: 0, leads: 0 };

  db.exec('BEGIN');
  try {
    // Embudo objetivo: 120 escaneos → 64 chats → 26 aviso de crédito → 19 KYC → 11 en banco → 5 aprobados.
    for (let i = 0; i < 120; i++) {
      const t0 = now - Math.floor(rand() * 30 * DAY);
      const v = pick(vehicles);
      const id = uid('ses_');
      const ref = shortCode(6);
      const chat = i < 64;
      const credit = i < 26;
      const kyc = i < 19;
      const bankSent = i < 11;
      const approved = i < 5;
      const rejected = i >= 5 && i < 7;
      const moreInfo = i === 7;
      const testDrive = (i >= 3 && i < 8) || (i >= 26 && i < 38);
      const name = chat ? `${pick(FIRST)} ${pick(LAST)}` : null;
      const wa = chat ? `52155500${String(1000 + i).slice(-4)}${Math.floor(rand() * 10)}` : null;
      let stage = 'scanned';
      if (chat) stage = 'chatting';
      if (testDrive) stage = 'test_drive_booked';
      if (credit) stage = 'credit_collecting';
      if (i >= 11 && i < 14) stage = 'signing';
      if (bankSent) stage = 'sent_to_bank';
      if (moreInfo) stage = 'bank_more_info';
      if (rejected) stage = 'bank_rejected';
      if (approved) stage = 'bank_approved';
      const paused = chat && (i % 9 === 0 || approved) ? 1 : 0;
      const t = (h) => Math.min(now - 60_000, t0 + h * 3_600_000);

      db.prepare(`INSERT INTO sessions (id, ref, kiosk_id, dealer_id, vehicle_id, lang, wa_id, name, email, stage, bot_paused, assigned_to, ref_expires_at, created_at, claimed_at, updated_at, last_inbound_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, ref, kiosk.id, kiosk.dealer_id, v.id, i % 7 === 0 ? 'en' : 'es', wa, name,
        credit ? `${name.split(' ')[0].toLowerCase()}.demo${i}@example.com` : null, stage, paused, paused ? 'ana' : null,
        t0 + 1_800_000, t0, chat ? t(0.05) : null, t(credit ? 30 : 2), chat ? t(credit ? 30 : 1) : null,
      );
      ev.run(id, kiosk.id, 'qr_scanned', JSON.stringify({ vehicle: v.id }), t0);
      counts.scans++;
      if (!chat) continue;
      counts.leads++;
      ev.run(id, kiosk.id, 'chat_started', null, t(0.05));
      if (i % 4 === 0) ev.run(null, kiosk.id, 'voice_agent_started', null, t0 - 300_000);

      const vName = v.name.es;
      CHATS.es.forEach(([dir, author, body], k) => {
        if (k > 2 && !credit && !testDrive && k > 4) return;
        msg.run(id, wa, dir, author, dir === 'in' && k === 3 ? 'audio' : k === 2 ? 'video' : 'text',
          body.replace('{v}', vName).replace('{ref}', ref).replace('{n}', name.split(' ')[0]), t(0.05 + k * 0.03));
      });
      db.prepare('INSERT INTO consents (id, session_id, type, version, channel, created_at) VALUES (?,?,?,?,?,?)').run(uid('con_'), id, 'privacy_notice_delivered', 'demo', 'whatsapp', t(0.06));

      if (testDrive) {
        const starts = now + (Math.floor(rand() * 9) - 3) * DAY;
        const slot = new Date(starts); slot.setUTCHours(16 + Math.floor(rand() * 7), 0, 0, 0);
        const past = slot.getTime() < now;
        db.prepare('INSERT INTO test_drives (id, session_id, dealer_id, vehicle_id, starts_at, status, reminder_sent, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(uid('td_'), id, kiosk.dealer_id, v.id, slot.getTime(), past ? (i % 5 === 0 ? 'no_show' : 'done') : 'booked', past ? 1 : 0, t(0.3), t(0.3));
        ev.run(id, null, 'test_drive_booked', null, t(0.3));
        if (past && i % 5) ev.run(id, null, 'test_drive_done', null, slot.getTime());
        msg.run(id, wa, 'in', 'customer', 'text', '¿Puedo ir a manejarlo el sábado?', t(0.25));
        msg.run(id, wa, 'out', 'system', 'text', `🚗 ¡Tu prueba de manejo quedó agendada! *${vName}*. Trae tu licencia de manejo vigente.`, t(0.3));
      }

      if (!credit) continue;
      db.prepare('INSERT INTO consents (id, session_id, type, version, channel, evidence, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(uid('con_'), id, 'credit_privacy', 'demo', 'whatsapp', JSON.stringify({ text: 'ACEPTO' }), t(1));
      ev.run(id, null, 'consent_credit_privacy', null, t(1));
      msg.run(id, wa, 'out', 'system', 'text', '🔒 Para tramitar tu crédito necesitamos tu consentimiento expreso. Aviso: https://cotizador.menteia.com/legal/privacidad-credito?lang=es — Responde *ACEPTO*.', t(0.9));
      msg.run(id, wa, 'in', 'customer', 'text', 'ACEPTO', t(1));

      if (kyc) {
        db.prepare('INSERT INTO kyc_checks (id, session_id, status, curp, doc_type, result_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(uid('kyc_'), id, 'approved', 'HEGG560427MVZRRL04', i % 6 === 0 ? 'pasaporte' : 'ine', JSON.stringify({ analysis: { provider: 'simulated' } }), t(1.2), t(1.3));
        ev.run(id, null, 'kyc_approved', null, t(1.3));
        msg.run(id, wa, 'out', 'system', 'text', '✅ Identidad verificada. Sigamos con tu solicitud de crédito.', t(1.3));
      }
      const price = 650_000 + Math.floor(rand() * 8) * 50_000;
      const statusMap = { sent_to_bank: 'sent_to_bank', bank_more_info: 'bank_more_info', bank_rejected: 'bank_rejected', bank_approved: 'bank_approved', signing: 'signing' };
      db.prepare('INSERT INTO credit_apps (id, folio, session_id, bank_id, status, data_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(uid('cre_'), `FIM-2026-${shortCode(6)}`, id, bank.id, statusMap[stage] || 'collecting',
          JSON.stringify({
            nombres: name.split(' ')[0], apellido_paterno: name.split(' ')[1], fecha_nacimiento: '1988-04-12', curp: 'HEGG560427MVZRRL04',
            rfc: 'XAXX010101000', estado_civil: 'casado', dependientes: 2, email: `demo${i}@example.com`, telefono: wa.slice(3),
            calle_numero: 'Av. Demo 123', colonia: 'Centro', municipio: 'Cuauhtémoc', estado: 'CDMX', cp: '06000', tipo_vivienda: 'propia',
            anios_domicilio: 5, tipo_ingreso: 'asalariado', empresa: 'Empresa Demo', antiguedad_laboral_anios: 4, ingreso_mensual_mxn: 55000,
            precio_vehiculo_mxn: price, enganche_mxn: price * 0.2, plazo_meses: 48,
            ...(i < 14 ? { ref1_nombre: 'Referencia Uno', ref1_telefono: '5511111111', ref1_relacion: 'hermano', ref2_nombre: 'Referencia Dos', ref2_telefono: '5522222222', ref2_relacion: 'amigo' } : {}),
          }), t(1.4), t(30));
      if (bankSent || moreInfo || rejected) {
        ev.run(id, null, 'sent_to_bank', null, t(26));
        msg.run(id, wa, 'out', 'system', 'text', `📨 Enviamos tu solicitud a *${bank.name}*. Te llegó copia a tu correo.`, t(26));
      }
      if (approved) {
        ev.run(id, null, 'stage_bank_approved', null, t(30));
        msg.run(id, wa, 'out', 'system', 'text', `🎉 ¡Buenas noticias! *${bank.name}* aprobó tu crédito. Un asesor te contactará.`, t(30));
        msg.run(id, wa, 'out', 'seller:ana', 'text', 'Hola, soy Ana de Ford Demo 🙌 ¿Te parece si agendamos la firma del contrato y la entrega?', t(30.2));
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return counts;
}
