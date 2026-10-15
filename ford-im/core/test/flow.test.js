import { startApp } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';

const { server, req } = await startApp();
test.after(() => server.close());

const kiosk = { 'x-kiosk-id': 'K-DEMO-01', 'x-kiosk-key': 'kiosk-test' };
const n8n = { authorization: 'Bearer n8n-test', 'content-type': 'application/json' };
const post = (p, body) => req('api.test', p, { method: 'POST', headers: n8n, body: JSON.stringify(body) });
const patch = (p, body) => req('api.test', p, { method: 'PATCH', headers: n8n, body: JSON.stringify(body) });

test('kiosco requiere llave', async () => {
  assert.equal((await req('fordim.test', '/api/qr?vehicle=bronco')).status, 401);
});

test('QR → go → WhatsApp → sesión → crédito → firma → banco → dictamen', async () => {
  // 1. Kiosco obtiene QR
  const qr = await (await req('fordim.test', '/api/qr?vehicle=bronco&lang=es', { headers: kiosk })).json();
  assert.match(qr.url, /^http:\/\/go\.test\/q\/[2-9A-Z]{8}$/);
  assert.ok(qr.svg.startsWith('<svg'));
  assert.equal(qr.rotateInMs, 30000);

  // 2. Escaneo → página que redirige a wa.me con ref
  const go = await req('go.test', new URL(qr.url).pathname);
  assert.equal(go.status, 200);
  const html = await go.text();
  const wa = html.match(/https:\/\/wa\.me\/5215511112222\?text=([^"&]+)/);
  assert.ok(wa, 'liga a WhatsApp');
  const prefill = decodeURIComponent(wa[1]);
  assert.match(prefill, /Ford Bronco/);

  // Token desconocido → 410
  assert.equal((await req('go.test', '/q/ZZZZZZZZ')).status, 410);

  // 3. Primer mensaje de WhatsApp
  const inbound = await (await post('/v1/inbound', { wa_id: '5215599990000', name: 'Ana López', text: prefill, message_id: 'wamid.1' })).json();
  assert.equal(inbound.ref_status, 'ok');
  assert.equal(inbound.is_new, true);
  assert.deepEqual(inbound.events, ['greeting_sent']);
  assert.equal(inbound.context.vehicle.id, 'bronco');
  const sid = inbound.session_id;

  // Otro número con el mismo ref no lo puede reclamar
  const other = await (await post('/v1/inbound', { wa_id: '5215500000001', text: prefill })).json();
  assert.notEqual(other.session_id, sid);
  assert.equal(other.ref_status, 'expired_or_taken');

  // Cambio de idioma
  assert.equal((await (await post('/v1/inbound', { wa_id: '5215599990000', text: 'English' })).json()).lang, 'en');

  // 4. Crédito: sin consentimiento → 409
  assert.equal((await post(`/v1/sessions/${sid}/credit`, { bank_id: 'bbva' })).status, 409);
  await post(`/v1/sessions/${sid}/credit-privacy`, {});
  const acc = await (await post('/v1/inbound', { wa_id: '5215599990000', text: 'I accept' })).json();
  assert.ok(acc.events.includes('credit_privacy_accepted'));
  assert.equal(acc.stage, 'credit_collecting');

  const started = await (await post(`/v1/sessions/${sid}/credit`, { bank_id: 'bbva' })).json();
  assert.equal(started.ready, false);
  const cid = started.id;

  // Validaciones
  const bad = await (await patch(`/v1/credit/${cid}`, { fields: { curp: 'NOPE', precio_vehiculo_mxn: 800000, enganche_mxn: 10000, plazo_meses: 72 } })).json();
  assert.equal(bad.errors.curp, 'invalid_curp');
  assert.match(bad.errors.enganche_mxn, /min_down_payment_pct/);
  assert.match(bad.errors.plazo_meses, /allowed/);

  const ok = await (await patch(`/v1/credit/${cid}`, { fields: {
    nombres: 'Ana', apellido_paterno: 'López', apellido_materno: 'Núñez', fecha_nacimiento: '1990-05-20',
    curp: 'HEGG560427MVZRRL04', rfc: 'LONA900520AB1', estado_civil: 'casado', dependientes: '2', email: 'ana@example.com',
    telefono: '55 9999 0000', calle_numero: 'Av. Reforma 100', colonia: 'Juárez', municipio: 'Cuauhtémoc', estado: 'CDMX', cp: '06600',
    tipo_vivienda: 'rentada', anios_domicilio: 3, tipo_ingreso: 'asalariado', empresa: 'ACME', antiguedad_laboral_anios: 4,
    ingreso_mensual_mxn: '$45,000', precio_vehiculo_mxn: 800000, enganche_mxn: 160000, plazo_meses: 48,
    ref1_nombre: 'Luis', ref1_telefono: '5511111111', ref1_relacion: 'hermano', ref2_nombre: 'Eva', ref2_telefono: '5522222222', ref2_relacion: 'amiga',
  } })).json();
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.missing_fields.length, 0);
  assert.equal(ok.data.ingreso_mensual_mxn, 45000);
  assert.ok(ok.simulation.monthly_payment > 0);
  assert.deepEqual(ok.missing_documents.map((d) => d.key), ['ine_frente', 'ine_reverso', 'comprobante_domicilio', 'comprobante_ingresos']);

  // Firmar sin documentos → 409
  assert.equal((await post(`/v1/credit/${cid}/sign`, {})).status, 409);

  // Documentos (se insertan directo: en producción vienen de WhatsApp vía media_id)
  const { saveDocument, creditStatus, getCredit } = await import('../src/services/credit.js');
  const jpg = Buffer.alloc(30_000, 1);
  for (const kind of ['ine_frente', 'ine_reverso', 'comprobante_domicilio', 'comprobante_ingresos']) {
    saveDocument({ sessionId: sid, creditId: cid, kind, buffer: jpg, mime: 'image/jpeg', filename: `${kind}.jpg` });
  }
  assert.equal(creditStatus(cid).ready, true);

  // 5. Firma (modo demo sin DocuSign)
  const sign = await (await post(`/v1/credit/${cid}/sign`, {})).json();
  assert.match(sign.url, /^http:\/\/firma\.test\/s\//);
  const signPath = new URL(sign.url).pathname;
  assert.equal((await req('firma.test', signPath)).status, 200);
  const done = await req('firma.test', `${signPath}/demo-complete`, { method: 'POST' });
  assert.equal(done.status, 303);
  assert.equal(getCredit(cid).status, 'sent_to_bank');

  // El PDF generado es válido y incluye solicitud + autorización Buró
  const { listDocuments } = await import('../src/services/credit.js');
  const fs = await import('node:fs');
  const signed = listDocuments(cid).find((d) => d.kind === 'solicitud_firmada');
  const pdf = await PDFDocument.load(fs.readFileSync(signed.path));
  assert.ok(pdf.getPageCount() >= 2);

  // 6. Dictamen del banco
  const { signToken } = await import('../src/lib/token.js');
  const bankTok = signToken('bank', { c: cid }, 3600);
  assert.equal((await req('bancos.test', `/r/${bankTok}`)).status, 200);
  const dec = await req('bancos.test', `/r/${bankTok}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status: 'approved', rate: '12.9', term: '48', analyst: 'Analista QA' }),
  });
  assert.equal(dec.status, 200);
  assert.equal(getCredit(cid).status, 'bank_approved');

  // Métricas
  const m = await (await req('api.test', '/admin/metrics', { headers: { authorization: 'Bearer admin-test' } })).json();
  assert.equal(m.funnel.find((f) => f.step === 'qr_scanned').count, 1);
  assert.equal(m.funnel.find((f) => f.step === 'sent_to_bank').count, 1);
});

test('avisos legales bilingües', async () => {
  const es = await (await req('legal.test', '/privacidad?lang=es')).text();
  const en = await (await req('legal.test', '/privacidad-credito?lang=en')).text();
  assert.match(es, /Aviso de Privacidad/);
  assert.match(en, /express consent/);
  assert.ok(!es.includes('{{'));
});

test('API n8n rechaza sin llave', async () => {
  assert.equal((await req('api.test', '/v1/banks')).status, 401);
});
