// Debida diligencia PLD (Ley Antilavado) y estación QR de escritorio del vendedor.
globalThis.FIM_TEST_ENV = { SINGLE_HOST: 'cotizador.test', DEMO_MODE: 'true', CRM_VIEW_KEY: 'ver-demo' };
const { startApp, completeKyc } = await import('./helpers.js');
const { default: test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { evaluate, thresholds, DEMO_LIST_HIT_CURP } = await import('../src/services/pld.js');
const { kioskKey } = await import('../src/lib/auth.js');

const { server, req } = await startApp();
test.after(() => server.close());
const H = 'cotizador.test';
const base = { ocupacion: 'Ingeniera', origen_recursos: 'salario', forma_pago: 'credito', efectivo_mxn: 0, cuenta_propia: true, beneficiario: '', pep: false };

test('PLD: umbrales en UMA, límite de efectivo y cotejo en listas', () => {
  const th = thresholds();
  assert.equal(th.identification_mxn, Math.round(3210 * 117.31));
  assert.equal(th.notice_mxn, Math.round(6420 * 117.31));

  const ok = evaluate({ answers: base, amountMxn: 569_900, curp: 'HEGG560427MVZRRL04' });
  assert.equal(ok.status, 'clear');
  assert.deepEqual(ok.obligations, ['identification']); // arriba de 3,210 UMA, abajo del aviso

  const aviso = evaluate({ answers: base, amountMxn: 900_000, curp: 'HEGG560427MVZRRL04' });
  assert.ok(aviso.obligations.includes('sat_notice'));

  const cash = evaluate({ answers: { ...base, forma_pago: 'mixto', efectivo_mxn: th.cash_limit_mxn }, amountMxn: 569_900 });
  assert.ok(cash.flags.includes('cash_over_limit'));
  assert.equal(cash.risk, 'alto');
  assert.equal(cash.status, 'review');

  const tercero = evaluate({ answers: { ...base, cuenta_propia: false, beneficiario: 'Luis Ruiz Gómez' }, amountMxn: 569_900 });
  assert.equal(tercero.status, 'review');
  assert.ok(tercero.obligations.includes('beneficial_owner'));

  const lista = evaluate({ answers: base, amountMxn: 569_900, curp: DEMO_LIST_HIT_CURP });
  assert.equal(lista.status, 'blocked');
});

test('Estación de escritorio: el QR asigna al vendedor y arranca identidad + PLD', async () => {
  const headers = { 'x-kiosk-id': 'E-DEMO-ANA', 'x-kiosk-key': kioskKey('E-DEMO-ANA') };
  assert.equal((await req(H, '/kiosco/api/config', { headers: { 'x-kiosk-id': 'E-DEMO-ANA', 'x-kiosk-key': 'otra' } })).status, 401);
  const cfg = await (await req(H, '/kiosco/api/config', { headers })).json();
  assert.equal(cfg.kiosk.type, 'desk');

  const qr = await (await req(H, '/kiosco/api/qr?vehicle=territory&lang=es', { headers })).json();
  const html = await (await req(H, new URL(qr.url).pathname)).text();
  const text = decodeURIComponent(html.match(/wa\.me\/\d+\?text=([^"&]+)/)[1]);
  assert.match(text, /iniciar mi trámite con Ana Torres/);

  const n8n = { authorization: 'Bearer n8n-test', 'content-type': 'application/json' };
  const inbound = await (await req(H, '/api/v1/inbound', { method: 'POST', headers: n8n, body: JSON.stringify({ wa_id: '5215580000777', name: 'Laura', text }) })).json();
  assert.deepEqual(inbound.events, ['greeting_sent']);
  const s = await (await req(H, `/api/v1/sessions/${inbound.session_id}`, { headers: n8n })).json();
  assert.equal(s.assigned_to, 'ana');
  assert.equal(s.stage, 'kyc');

  // La liga de identidad llegó por WhatsApp; el cliente la completa con su cuestionario PLD.
  const conv = await (await req(H, `/crm/api/conversations/${inbound.session_id}?k=ver-demo`)).json();
  const link = conv.messages.map((m) => m.body).join('\n').match(/https?:\/\/\S+\/kyc\/k\/\S+/)[0];
  const kyc = await completeKyc(req, link, { pld: { ocupacion: 'Abogada', origen_recursos: 'negocio', forma_pago: 'transferencia', cuenta_propia: '1', pep: '1' } });
  assert.equal(kyc.json.status, 'approved');
  assert.equal(kyc.json.pld.status, 'review'); // persona políticamente expuesta → revisión

  const detail = await (await req(H, `/crm/api/conversations/${inbound.session_id}?k=ver-demo`)).json();
  assert.equal(detail.pld.risk, 'alto');
  assert.ok(detail.pld.flags.includes('pep'));
});

test('PLD: el cuestionario es obligatorio para enviar la identificación', async () => {
  const link = (await req(H, '/demo/kyc')).headers.location;
  const res = await completeKyc(req, link, { pld: { ocupacion: 'x' } });
  assert.equal(res.status, 422);
  assert.ok(res.json.errors.includes('pld_origen'));
});
