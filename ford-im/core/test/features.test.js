import { startApp } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { server, req } = await startApp();
test.after(() => server.close());

const n8n = { authorization: 'Bearer n8n-test', 'content-type': 'application/json' };
const post = (p, body) => req('api.test', p, { method: 'POST', headers: n8n, body: JSON.stringify(body) });

async function newLead(wa, name) {
  const qr = await (await req('fordim.test', '/api/qr?vehicle=ranger&lang=es', { headers: { 'x-kiosk-id': 'K-DEMO-01', 'x-kiosk-key': 'kiosk-test' } })).json();
  const html = await (await req('go.test', new URL(qr.url).pathname)).text();
  const text = decodeURIComponent(html.match(/wa\.me\/\d+\?text=([^"&]+)/)[1]);
  return (await (await post('/v1/inbound', { wa_id: wa, name, text })).json()).session_id;
}

test('prueba de manejo: horarios, reserva, cupo y reprogramación', async () => {
  const sid = await newLead('5215570000001', 'Luis Torres');
  const slots = await (await req('api.test', `/v1/sessions/${sid}/test-drive/slots?limit=5`, { headers: n8n })).json();
  assert.ok(slots.length > 0);
  assert.ok(slots[0].starts_at > Date.now() + 2 * 3600_000 - 1000, 'respeta la anticipación mínima');
  assert.match(slots[0].time, /^\d{2}:\d{2}$/);

  const booked = await (await post(`/v1/sessions/${sid}/test-drive`, { starts_at: slots[0].starts_at })).json();
  assert.equal(booked.status, 'booked');
  assert.match(booked.calendar_url, /^https:\/\/calendar\.google\.com/);
  const s = await (await req('api.test', `/v1/sessions/${sid}`, { headers: n8n })).json();
  assert.equal(s.stage, 'test_drive_booked');

  // Horario inexistente → 409 con alternativas
  const bad = await post(`/v1/sessions/${sid}/test-drive`, { starts_at: slots[0].starts_at + 7 * 60_000 });
  assert.equal(bad.status, 409);

  // Cupo de 2 por horario: un tercer cliente ya no lo ve disponible
  const sid2 = await newLead('5215570000002', 'Eva Ruiz');
  await post(`/v1/sessions/${sid2}/test-drive`, { starts_at: slots[0].starts_at });
  const sid3 = await newLead('5215570000003', 'Iván Gil');
  const s3 = await (await req('api.test', `/v1/sessions/${sid3}/test-drive/slots?limit=5`, { headers: n8n })).json();
  assert.ok(!s3.some((x) => x.starts_at === slots[0].starts_at));

  // Reprogramar libera el horario anterior
  await post(`/v1/sessions/${sid}/test-drive`, { starts_at: slots[1].starts_at });
  const again = await (await req('api.test', `/v1/sessions/${sid3}/test-drive/slots?limit=5`, { headers: n8n })).json();
  assert.ok(again.some((x) => x.starts_at === slots[0].starts_at));

  // Recordatorio (24 h antes)
  const { sendDueReminders } = await import('../src/services/testdrive.js');
  assert.ok((await sendDueReminders(slots[1].starts_at - 20 * 3600_000)) >= 1);
  assert.equal(await sendDueReminders(slots[1].starts_at - 20 * 3600_000), 0, 'no se repite');
});

test('bandeja del vendedor: login, conversaciones, tomar y responder', async () => {
  const sid = await newLead('5215570000009', 'Sofía Díaz');
  assert.equal((await req('vendedor.test', '/')).status, 302);
  const login = await req('vendedor.test', '/login', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'user=ana&key=llave-ana',
  });
  assert.equal(login.status, 303);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const h = { cookie, 'content-type': 'application/json', 'x-fim': '1' };
  const bad = await req('vendedor.test', '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'user=ana&key=x' });
  assert.equal(bad.status, 401);

  const list = await (await req('vendedor.test', '/api/conversations', { headers: h })).json();
  assert.ok(list.some((c) => c.id === sid));
  const conv = await (await req('vendedor.test', `/api/conversations/${sid}`, { headers: h })).json();
  assert.equal(conv.window_open, true);
  assert.ok(conv.messages.some((m) => m.direction === 'in' && /Ford Ranger/.test(m.body)));
  assert.ok(conv.messages.some((m) => m.direction === 'out' && m.type === 'video'));

  // Sin la cabecera anti-CSRF no se acepta
  assert.equal((await req('vendedor.test', `/api/conversations/${sid}/take`, { method: 'POST', headers: { cookie } })).status, 403);

  const sent = await req('vendedor.test', `/api/conversations/${sid}/messages`, { method: 'POST', headers: h, body: JSON.stringify({ text: 'Hola Sofía, soy Ana 👋' }) });
  assert.equal(sent.status, 200);
  const after = await (await req('vendedor.test', `/api/conversations/${sid}`, { headers: h })).json();
  assert.equal(after.session.bot_paused, true, 'al escribir, el vendedor toma la conversación');
  assert.equal(after.session.assigned_to, 'ana');
  assert.ok(after.messages.some((m) => m.author === 'seller:ana'));

  // El bot queda pausado para n8n
  const inbound = await (await post('/v1/inbound', { wa_id: '5215570000009', text: 'gracias' })).json();
  assert.equal(inbound.bot_paused, true);

  await req('vendedor.test', `/api/conversations/${sid}/release`, { method: 'POST', headers: h });
  assert.equal((await (await post('/v1/inbound', { wa_id: '5215570000009', text: 'ok' })).json()).bot_paused, false);

  const f = await (await req('vendedor.test', '/api/funnel?days=30', { headers: h })).json();
  assert.equal(f.funnel[0].id, 'scans');
  assert.ok(f.funnel[0].count >= 1);
  assert.equal(f.columns.length, 6);
});
