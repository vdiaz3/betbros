// Vamo Mesa: menú, precompra con beneficio, kiosco, inventario, pase, encuesta, indicadores.
globalThis.FIM_TEST_ENV = { SINGLE_HOST: 'cotizador.test', DEMO_MODE: 'true' };
const { startApp } = await import('./helpers.js');
const { default: test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { seedMesa } = await import('../src/mesa/seed.js');
const mesa = await import('../src/mesa/service.js');
const { staffKey } = await import('../src/mesa/routes.js');

const { server, req } = await startApp();
test.after(() => server.close());
seedMesa();
const H = 'cotizador.test';
const K = `k=${encodeURIComponent(staffKey())}`;
const json = { 'content-type': 'application/json' };
const today = mesa.today();
const items = mesa.listItems();
const main = items.find((i) => i.category === 'menu');
const premium = items.find((i) => i.category === 'premium');
const stock = (id) => mesa.listIngredients().find((g) => g.id === id).stock;

async function login(number = '10021', pin = '1234') {
  const r = await req(H, '/mesa/api/login', { method: 'POST', headers: json, body: JSON.stringify({ number, pin }) });
  assert.equal(r.status, 200);
  return { cookie: [].concat(r.headers['set-cookie'])[0].split(';')[0], employee: (await r.json()).employee };
}

test('Páginas: landing pública y personal con llave', async () => {
  assert.match(await (await req(H, '/mesa/')).text(), /Vamo Mesa/);
  assert.equal((await req(H, '/mesa/cocina')).status, 401);
  assert.equal((await req(H, `/mesa/cocina?${K}`)).status, 200);
  assert.equal((await req(H, '/mesa/api/staff/orders')).status, 401);
});

test('Precompra con beneficio, inventario, agotado, kiosco y cancelación', async () => {
  // Porciones disponibles exactas sobre lo que el historial de ejemplo ya vendió hoy.
  const soldToday = (id) => mesa.menuFor(today).find((m) => m.id === id)?.sold ?? 0;
  for (const [it, qty] of [[main, 2], [premium, 3]]) {
    const r = await req(H, `/mesa/api/staff/menu?${K}`, { method: 'POST', headers: json, body: JSON.stringify({ date: today, item_id: it.id, planned_qty: soldToday(it.id) + qty }) });
    assert.equal(r.status, 200);
  }
  const { cookie, employee } = await login();
  const pollo = stock('pollo');
  const res = await req(H, '/mesa/api/orders', { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ date: today, lines: [{ item_id: main.id, qty: 1 }, { item_id: premium.id, qty: 1 }] }) });
  assert.equal(res.status, 201);
  const { order, employee: after } = await res.json();
  assert.equal(order.total, main.price_mxn + premium.price_mxn);
  assert.equal(order.benefit_used, main.price_mxn); // lo premium no aplica beneficio
  assert.equal(order.card_paid, premium.price_mxn);
  assert.equal(after.benefit_balance, Math.round((employee.benefit_balance - main.price_mxn) * 100) / 100);
  if (main.name.includes('pollo')) assert.ok(stock('pollo') < pollo);

  const sold = await req(H, '/mesa/api/orders', { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ date: today, lines: [{ item_id: main.id, qty: 2 }] }) });
  assert.equal(sold.status, 409);
  assert.equal((await sold.json()).error, 'sold_out');

  const kiosk = await (await req(H, `/mesa/api/staff/kiosk/orders?${K}`, { method: 'POST', headers: json, body: JSON.stringify({ lines: [{ item_id: premium.id, qty: 1 }], pay: 'card' }) })).json();
  assert.equal(kiosk.order.channel, 'kiosk');
  assert.equal(kiosk.order.card_paid, premium.price_mxn);

  const cancel = await (await req(H, `/mesa/api/orders/${order.id}/cancel`, { method: 'POST', headers: { cookie } })).json();
  assert.equal(cancel.order.status, 'cancelled');
  assert.equal(cancel.employee.benefit_balance, employee.benefit_balance);
});

test('Pase: hasta entregado; la encuesta llega por correo y alimenta los indicadores', async () => {
  const { cookie } = await login('10022');
  const { order } = await (await req(H, '/mesa/api/orders', { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ date: today, lines: [{ item_id: main.id, qty: 1 }] }) })).json();
  for (const st of ['preparing', 'ready', 'delivered']) {
    const o = await (await req(H, `/mesa/api/staff/orders/${order.id}/advance?${K}`, { method: 'POST', headers: json, body: '{}' })).json();
    assert.equal(o.status, st);
  }
  const mail = (await (await req(H, `/mesa/api/staff/outbox?${K}`)).json())[0];
  assert.match(mail.to_email, /example\.com/);
  const sid = mail.url.split('/encuesta/')[1];
  assert.equal((await req(H, `/mesa/encuesta/${sid}`)).status, 200);
  const r = await req(H, `/mesa/api/survey/${sid}`, { method: 'POST', headers: json, body: JSON.stringify({ rating: 5, liked: ['sabor'], improve: 'Más salsa' }) });
  assert.equal(r.status, 200);
  assert.equal((await req(H, `/mesa/api/survey/${sid}`, { method: 'POST', headers: json, body: JSON.stringify({ rating: 4 }) })).status, 409);

  const k = await (await req(H, `/mesa/api/staff/kpis?from=${today}&to=${today}&${K}`)).json();
  assert.ok(k.orders >= 2);
  assert.ok(k.csat >= 1);
  assert.ok(k.avg_prep_min != null);
});

test('Carga de menú por CSV y reportes exportables', async () => {
  const csv = `fecha,platillo,categoria,precio,porciones\n${today},Menú del día: chiles rellenos,menu,85,40\n${today},Atún sellado,premium,170,10\nmal,renglon`;
  const r = await (await req(H, `/mesa/api/staff/menu/csv?${K}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: csv })).json();
  assert.equal(r.loaded, 2);
  assert.equal(r.errors.length, 1);
  assert.ok(mesa.menuFor(today).some((i) => i.name === 'Atún sellado' && i.planned_qty === 10));
  const rep = await req(H, `/mesa/api/staff/report/tiempos?from=${today}&to=${today}&format=csv&${K}`);
  assert.match(rep.headers['content-type'], /text\/csv/);
  assert.match(await rep.text(), /tiempo_en_piso_min/);
});
