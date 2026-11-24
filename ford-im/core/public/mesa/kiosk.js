// Kiosco táctil del comedor: menú de hoy, carrito y cobro con beneficio (número de empleado +
// NIP) o con tarjeta (terminal simulada en el demo). Al pagar muestra el código del pedido.
import { $, esc, money, CAT, api, toast } from './common.js';

const root = document.getElementById('app');
const state = { items: [], cart: {}, step: 'menu', number: '', pin: '', field: 'number', idle: null };

async function load() {
  const week = await api('week');
  state.items = week.days.find((d) => d.date === week.today)?.items || [];
  render();
}

const lines = () => Object.entries(state.cart).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty }));
const total = () => lines().reduce((a, l) => a + l.qty * (state.items.find((i) => i.id === l.item_id)?.price_mxn || 0), 0);

function reset() { Object.assign(state, { cart: {}, step: 'menu', number: '', pin: '', field: 'number' }); load(); }
function touch() { clearTimeout(state.idle); state.idle = setTimeout(reset, 90_000); }
addEventListener('pointerdown', touch);

function render() {
  const head = `<div class="k-head"><img src="assets/mesa-mark.svg" width="44" height="44" alt=""><div><h1 style="margin:0">¿Qué se te antoja hoy?</h1><p class="muted" style="margin:0">Toca un platillo para agregarlo</p></div></div>`;
  if (state.step === 'done') return;
  root.innerHTML = `${head}<div class="k-grid">
    <div>${['menu', 'premium', 'grab_go'].map((cat) => {
      const items = state.items.filter((i) => i.category === cat);
      return items.length ? `<h2 style="margin:10px 0">${CAT[cat]}</h2><div class="grid g2">${items.map(dish).join('')}</div>` : '';
    }).join('') || '<p class="empty">El menú de hoy aún no está cargado.</p>'}</div>
    <aside class="k-side card">${state.step === 'menu' ? cartPanel() : payPanel()}</aside></div>`;
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
    const it = state.items.find((i) => i.id === b.dataset.add);
    state.cart[it.id] = Math.max(0, Math.min(it.available, (state.cart[it.id] || 0) + Number(b.dataset.d)));
    render();
  }));
  $('#pay')?.addEventListener('click', () => { state.step = 'pay'; render(); });
  $('#back')?.addEventListener('click', () => { state.step = 'menu'; render(); });
  root.querySelectorAll('[data-field]').forEach((b) => (b.onclick = () => { state.field = b.dataset.field; render(); }));
  root.querySelectorAll('[data-key]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.key;
    const v = state[state.field];
    state[state.field] = k === '⌫' ? v.slice(0, -1) : k === 'C' ? '' : (v + k).slice(0, state.field === 'pin' ? 4 : 8);
    render();
  }));
  $('#benefit')?.addEventListener('click', () => checkout('benefit'));
  $('#card')?.addEventListener('click', () => checkout('card'));
}

const dish = (i) => {
  const q = state.cart[i.id] || 0;
  return `<div class="dish"><div class="emo">${i.emoji || '🍽️'}</div>
    <div><b>${esc(i.name)}</b><p class="muted small">${money(i.price_mxn)} · ${i.available ? `quedan ${i.available}` : 'agotado'}</p></div>
    <div class="qty">${q ? `<button data-add="${i.id}" data-d="-1">−</button><b>${q}</b>` : ''}<button data-add="${i.id}" data-d="1" ${i.available > q ? '' : 'disabled'}>+</button></div></div>`;
};

const cartPanel = () => `<h2>Tu pedido</h2>${lines().length ? `<ul>${lines().map((l) => {
  const it = state.items.find((i) => i.id === l.item_id);
  return `<li>${l.qty} × ${esc(it.name)} <b style="float:right">${money(l.qty * it.price_mxn)}</b></li>`;
}).join('')}</ul><p style="font-size:24px"><b>Total ${money(total())}</b></p><button class="btn block" id="pay">Pagar</button>` : '<p class="muted">Aún no agregas platillos.</p>'}`;

const payPanel = () => `<h2>Pagar ${money(total())}</h2>
  <p class="muted small">Usa tu beneficio de comedor con tu número de empleado y NIP, o paga con tarjeta.</p>
  <div class="grid g2"><button class="btn ${state.field === 'number' ? '' : 'ghost'}" data-field="number">Empleado: ${esc(state.number || '—')}</button>
  <button class="btn ${state.field === 'pin' ? '' : 'ghost'}" data-field="pin">NIP: ${'•'.repeat(state.pin.length) || '—'}</button></div>
  <div class="keypad" style="margin:12px 0">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => `<button data-key="${k}">${k}</button>`).join('')}</div>
  <button class="btn block" id="benefit" ${state.number && state.pin.length === 4 ? '' : 'disabled'}>Pagar con mi beneficio</button>
  <button class="btn warm block" id="card" style="margin-top:10px">💳 Pagar con tarjeta</button>
  <button class="btn ghost block" id="back" style="margin-top:10px">← Volver</button>
  <p class="muted small">Demo: empleado 10021, NIP 1234. El cobro con tarjeta es simulado.</p>`;

async function checkout(pay) {
  try {
    const body = { lines: lines(), pay };
    if (pay === 'benefit') Object.assign(body, { number: state.number, pin: state.pin });
    const { order } = await api('staff/kiosk/orders', { method: 'POST', body });
    state.step = 'done';
    root.innerHTML = `<main class="narrow" style="text-align:center;margin-top:12vh"><p style="font-size:64px;margin:0">✅</p>
      <h1>¡Listo${order.employee ? `, ${esc(order.employee.name.split(' ')[0])}` : ''}!</h1><p class="muted">Tu código de pedido es</p>
      <p style="font:800 96px/1 var(--head);letter-spacing:.08em;margin:10px 0">${esc(order.code)}</p>
      <p class="muted">Te avisamos en la pantalla de salida cuando esté listo.${order.benefit_used ? ` Beneficio usado: ${money(order.benefit_used)}.` : ''}${order.card_paid ? ` Tarjeta: ${money(order.card_paid)}.` : ''}</p></main>`;
    setTimeout(reset, 9000);
  } catch (err) { toast(err.message); }
}

load();
