// Sin token de Meta: los mensajes salen por el webhook de envío de n8n.
import http from 'node:http';

const captured = [];
const sink = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => { captured.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body) }); res.end('{}'); });
}).listen(0);
await new Promise((r) => sink.once('listening', r));
globalThis.FIM_TEST_ENV = { WA_N8N_SEND_URL: `http://127.0.0.1:${sink.address().port}/webhook/ford-im/send` };

const { startApp } = await import('./helpers.js');
const { default: test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { server, req } = await startApp();
test.after(() => { server.close(); sink.close(); });

const n8n = { authorization: 'Bearer n8n-test', 'content-type': 'application/json' };
const post = (p, body) => req('api.test', p, { method: 'POST', headers: n8n, body: JSON.stringify(body) });

test('bienvenida, video y reseña salen por el webhook de n8n', async () => {
  const qr = await (await req('fordim.test', '/api/qr?vehicle=territory&lang=es', { headers: { 'x-kiosk-id': 'K-DEMO-01', 'x-kiosk-key': 'kiosk-test' } })).json();
  const html = await (await req('go.test', new URL(qr.url).pathname)).text();
  const text = decodeURIComponent(html.match(/wa\.me\/\d+\?text=([^"&]+)/)[1]);
  const inbound = await (await post('/v1/inbound', { wa_id: '5215583139537', text })).json();
  assert.deepEqual(inbound.events, ['greeting_sent']);

  assert.equal(captured.length, 3);
  assert.ok(captured.every((c) => c.path === '/webhook/ford-im/send' && c.auth === 'Bearer n8n-test'));
  assert.deepEqual(captured.map((c) => c.body.type), ['text', 'video', 'text']);
  assert.equal(captured[0].body.to, '5215583139537');
  assert.match(captured[0].body.text.body, /Aviso de Privacidad/);
  assert.match(captured[1].body.video.link, /ford-brand-loop\.mp4$/);
  assert.match(captured[2].body.text.body, /AutoDinámico/);

  // Respuesta "en voz" sin voz disponible → se manda como texto
  captured.length = 0;
  const r = await post('/v1/reply', { session_id: inbound.session_id, text: 'Hola, te ayudo', as_audio: true });
  assert.equal(r.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].body.type, 'text');

  // Nota de voz entrante sin token: no rompe, el agente recibe la indicación
  const audio = await (await post('/v1/inbound', { wa_id: '5215583139537', type: 'audio', media_id: 'm1' })).json();
  assert.match(audio.text, /nota de voz/);
});
