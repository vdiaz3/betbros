// Modo demo en un solo subdominio: cotizador.test/{kiosco,go,crm,legal,media,...}
globalThis.FIM_TEST_ENV = { SINGLE_HOST: 'cotizador.test', DEMO_MODE: 'true', ENABLED_BANKS: 'bbva', CRM_VIEW_KEY: 'ver-demo' };
const { startApp, completeKyc } = await import('./helpers.js');
const { default: test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');

const { server, req } = await startApp();
test.after(() => server.close());
const H = 'cotizador.test';

test('portada y sitios por ruta', async () => {
  const home = await (await req(H, '/')).text();
  assert.match(home, /5,999/);
  assert.match(home, /cotizador\.test\/kiosco\/k\/K-DEMO-01\?key=kiosk-test/);
  assert.match(home, /cotizador\.test\/crm\/\?k=ver-demo/);
  assert.doesNotMatch(home, /\{\{\w+\}\}/);
  assert.equal((await req(H, '/landing/landing.js')).status, 200);
  assert.match(await (await req(H, '/demo')).text(), /Abrir kiosco/);
  const kiosk = await (await req(H, '/kiosco/k/K-DEMO-01')).text();
  assert.match(kiosk, /<base href="\/kiosco\/">/);
  assert.equal((await req(H, '/kiosco/kiosk/kiosk.js')).status, 200);
  assert.equal((await req(H, '/legal/terminos?lang=es')).status, 200);
  assert.equal((await req(H, '/media/pdf/solicitud-credito-bbva-demo.pdf')).status, 200);
  assert.equal((await req(H, '/api/health')).status, 200);
});

test('KYC de prueba desde la landing', async () => {
  const r = await req(H, '/demo/kyc');
  assert.equal(r.status, 302);
  const url = r.headers.location;
  assert.match(url, /^http:\/\/cotizador\.test\/kyc\/k\//);
  const kyc = await completeKyc(req, url, { docType: 'pasaporte' });
  assert.equal(kyc.json.status, 'approved');
  const view = await (await req(H, '/crm/api/conversations?k=ver-demo')).json();
  assert.ok(!JSON.stringify(view).includes('Visitante web'));
});

test('QR y ligas apuntan al mismo subdominio', async () => {
  const qr = await (await req(H, '/kiosco/api/qr?vehicle=bronco&lang=es', { headers: { 'x-kiosk-id': 'K-DEMO-01', 'x-kiosk-key': 'kiosk-test' } })).json();
  assert.match(qr.url, /^http:\/\/cotizador\.test\/go\/q\/[2-9A-Z]{8}$/);
  assert.match(qr.svg, /href="\/kiosco\/kiosk\/assets\/ford-logo\.png"/);
  const html = await (await req(H, new URL(qr.url).pathname)).text();
  const text = decodeURIComponent(html.match(/wa\.me\/\d+\?text=([^"&]+)/)[1]);
  const n8n = { authorization: 'Bearer n8n-test', 'content-type': 'application/json' };
  const inbound = await (await req(H, '/api/v1/inbound', { method: 'POST', headers: n8n, body: JSON.stringify({ wa_id: '5215580000001', text }) })).json();
  const sid = inbound.session_id;
  await req(H, `/api/v1/sessions/${sid}/credit-privacy`, { method: 'POST', headers: n8n, body: '{}' });
  await req(H, '/api/v1/inbound', { method: 'POST', headers: n8n, body: JSON.stringify({ wa_id: '5215580000001', text: 'ACEPTO' }) });
  const link = await (await req(H, `/api/v1/sessions/${sid}/kyc`, { method: 'POST', headers: n8n, body: '{}' })).json();
  assert.match(link.url, /^http:\/\/cotizador\.test\/kyc\/k\//);
  const kyc = await completeKyc(req, link.url, { docType: 'pasaporte' });
  assert.equal(kyc.json.status, 'approved');
  const banks = await (await req(H, '/api/v1/banks', { headers: n8n })).json();
  assert.deepEqual(banks.map((b) => b.id), ['bbva']);
  const credit = await (await req(H, `/api/v1/sessions/${sid}/credit`, { method: 'POST', headers: n8n, body: JSON.stringify({ bank_id: 'bbva' }) })).json();
  assert.deepEqual(credit.documents.map((d) => d.kind), ['pasaporte']);
});

test('CRM de sólo lectura con datos de ejemplo', async () => {
  const { seedDemo } = await import('../src/demo/seed.js');
  const seeded = seedDemo({ force: true });
  assert.equal(seeded.scans, 120);
  assert.equal((await req(H, '/crm/')).status, 401, 'sin llave no se ve');
  const page = await req(H, '/crm/?k=ver-demo');
  assert.equal(page.status, 200, 'con la liga de la portada');
  assert.match(await page.text(), /<base href="\/crm\/">/);
  const cookie = page.headers['set-cookie'][0].split(';')[0];
  const get = (p) => req(H, p, { headers: { cookie } });
  const me = await (await get('/crm/api/me')).json();
  assert.equal(me.read_only, true);
  const f = await (await get('/crm/api/funnel?days=30')).json();
  const by = Object.fromEntries(f.funnel.map((x) => [x.id, x.count]));
  assert.ok(by.scans >= 120 && by.chats >= 64 && by.approved >= 5);
  assert.ok(by.scans >= by.chats && by.chats >= by.credit && by.credit >= by.kyc && by.kyc >= by.signed && by.signed >= by.approved);
  const list = await (await get('/crm/api/conversations')).json();
  assert.ok(list.length >= 64);
  const conv = await (await get(`/crm/api/conversations/${list[0].id}`)).json();
  assert.ok(conv.messages.length > 0);
  // Ninguna acción de escritura
  const w = await req(H, `/crm/api/conversations/${list[0].id}/take`, { method: 'POST', headers: { cookie, 'x-fim': '1' } });
  assert.equal(w.status, 403);
});
