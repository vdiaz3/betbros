// Portal del colaborador: entra con número de empleado + NIP, ve el menú de la semana,
// precompra y paga con su beneficio de comedor (el excedente o lo premium, con tarjeta).
import { $, esc, money, CAT, STATUS, api, toast, dayLabel, topbar } from './common.js';

const root = document.getElementById('app');
const state = { me: null, orders: [], days: [], today: null, date: null, cart: {}, pay: 'benefit' };

async function boot() {
  try {
    const me = await api('me');
    state.me = me.employee;
    state.orders = me.orders;
  } catch { state.me = null; }
  if (!state.me) return renderLogin();
  const week = await api('week');
  state.today = week.today;
  state.days = week.days.filter((d) => d.items.length);
  state.date ??= state.days[0]?.date ?? week.today;
  render();
}

function renderLogin(error = '') {
  root.innerHTML = `${topbar('Mi comedor')}
  <main class="narrow"><div class="card">
    <h1>Hola 👋</h1><p class="muted">Entra con tu número de empleado y tu NIP para ver el menú y apartar tu comida.</p>
    ${error ? `<p class="bad">${esc(error)}</p>` : ''}
    <form id="login"><label>Número de empleado<input name="number" inputmode="numeric" autocomplete="username" required></label>
    <label>NIP<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>
    <button class="btn block">Entrar</button></form>
    <p class="muted small">Demo: número 10021 a 10028, NIP 1234.</p></div></main>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api('login', { method: 'POST', body: { number: f.get('number'), pin: f.get('pin') } }); boot(); }
    catch (err) { renderLogin(err.message); }
  };
}

const day = () => state.days.find((d) => d.date === state.date);
const cartLines = () => Object.entries(state.cart).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty }));

function totals() {
  const items = Object.fromEntries((day()?.items || []).map((i) => [i.id, i]));
  let total = 0, eligible = 0;
  for (const { item_id, qty } of cartLines()) {
    const it = items[item_id];
    if (!it) continue;
    total += it.price_mxn * qty;
    if (it.benefit_eligible) eligible += it.price_mxn * qty;
  }
  const benefit = state.pay === 'benefit' ? Math.min(state.me.benefit_balance, eligible) : 0;
  return { total, benefit, card: total - benefit };
}

function render() {
  const e = state.me;
  const upcoming = state.orders.filter((o) => o.status !== 'cancelled' && o.status !== 'delivered');
  root.innerHTML = `${topbar('Mi comedor', `<span class="muted small">${esc(e.name)} · beneficio <b>${money(e.benefit_balance)}</b></span><button class="btn sm ghost" id="out">Salir</button>`)}
  <main>
    ${upcoming.length ? `<section class="card" style="margin-bottom:16px"><h3>Tus pedidos</h3>${upcoming.map(orderCard).join('')}</section>` : ''}
    <h2>Menú de la semana</h2>
    <div class="days">${state.days.map((d) => `<button data-date="${d.date}" class="${d.date === state.date ? 'on' : ''}"><b>${esc(dayLabel(d.date, { weekday: 'short', day: 'numeric' }))}</b><small>${d.date === state.today ? 'Hoy' : `${d.items.length} opciones`}</small></button>`).join('')}</div>
    ${['menu', 'premium', 'grab_go'].map((cat) => {
      const items = (day()?.items || []).filter((i) => i.category === cat);
      return items.length ? `<h3 style="margin:20px 0 10px">${CAT[cat]}</h3><div class="grid">${items.map(dish).join('')}</div>` : '';
    }).join('') || '<p class="empty">No hay menú cargado para este día.</p>'}
  </main>
  ${cartBar()}`;
  $('#out').onclick = async () => { await api('logout', { method: 'POST' }); state.cart = {}; boot(); };
  root.querySelectorAll('.days button').forEach((b) => (b.onclick = () => { state.date = b.dataset.date; state.cart = {}; render(); }));
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => change(b.dataset.add, +Number(b.dataset.d))));
  root.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => cancel(b.dataset.cancel)));
  root.querySelectorAll('input[name="pay"]').forEach((r) => (r.onchange = () => { state.pay = r.value; render(); }));
  $('#buy')?.addEventListener('click', buy);
}

function dish(i) {
  const q = state.cart[i.id] || 0;
  return `<div class="dish"><div class="emo">${i.emoji || '🍽️'}</div>
    <div><b>${esc(i.name)}</b> <span class="pill ${i.category}">${CAT[i.category]}</span>
      <p class="muted small">${esc(i.description || '')}${i.kcal ? ` · ${i.kcal} kcal` : ''}</p>
      <p class="small"><b>${money(i.price_mxn)}</b> · ${i.available ? `quedan ${i.available}` : '<span class="bad">agotado</span>'}${i.benefit_eligible ? '' : ' · <span class="muted">no aplica beneficio</span>'}</p></div>
    <div class="qty">${q ? `<button data-add="${i.id}" data-d="-1" aria-label="Quitar">−</button><b>${q}</b>` : ''}<button data-add="${i.id}" data-d="1" aria-label="Agregar" ${i.available > q ? '' : 'disabled'}>+</button></div></div>`;
}

function change(id, d) {
  const it = day().items.find((i) => i.id === id);
  state.cart[id] = Math.max(0, Math.min(it.available, (state.cart[id] || 0) + d));
  render();
}

function cartBar() {
  if (!cartLines().length) return '';
  const t = totals();
  return `<div class="cart"><div class="wrap">
    <div><b>${cartLines().reduce((a, l) => a + l.qty, 0)} platillo(s) · ${money(t.total)}</b><br><span class="muted small">${esc(dayLabel(state.date))}</span></div>
    <label class="small" style="margin:0;font-weight:500"><input type="radio" name="pay" value="benefit" ${state.pay === 'benefit' ? 'checked' : ''} style="width:auto"> Beneficio (${money(t.benefit)})${t.card && state.pay === 'benefit' ? ` + tarjeta ${money(t.card)}` : ''}</label>
    <label class="small" style="margin:0;font-weight:500"><input type="radio" name="pay" value="card" ${state.pay === 'card' ? 'checked' : ''} style="width:auto"> Sólo tarjeta</label>
    <div class="spacer"></div><button class="btn" id="buy">Apartar y pagar</button></div></div>`;
}

async function buy() {
  $('#buy').disabled = true;
  try {
    const { order, employee } = await api('orders', { method: 'POST', body: { lines: cartLines(), date: state.date, pay: state.pay } });
    state.me = employee;
    state.cart = {};
    toast(`Listo: tu código es ${order.code}`);
    boot();
  } catch (err) { toast(err.message); $('#buy').disabled = false; }
}

async function cancel(id) {
  try { const { employee } = await api(`orders/${id}/cancel`, { method: 'POST' }); state.me = employee; toast('Pedido cancelado; el beneficio regresó a tu saldo.'); boot(); }
  catch (err) { toast(err.message); }
}

const orderCard = (o) => `<div class="ordercard" style="padding:10px 0;border-top:1px solid var(--line)">
  <div class="code">${esc(o.code)}</div>
  <div style="flex:1"><b>${esc(dayLabel(o.date, { weekday: 'long', day: 'numeric' }))}</b> · <span class="status ${o.status}">${STATUS[o.status]}</span><br>
  <span class="muted small">${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')} · ${money(o.total)}${o.benefit_used ? ` (beneficio ${money(o.benefit_used)})` : ''}</span></div>
  ${o.status === 'paid' ? `<button class="btn sm ghost" data-cancel="${o.id}">Cancelar</button>` : ''}</div>`;

boot();
