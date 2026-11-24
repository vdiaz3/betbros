// Pase sin papel: tablero táctil de pedidos de hoy (nuevo → preparando → listo → entregado).
// Con ?modo=salida es la pantalla para comensales: códigos en preparación y listos.
// Opcional: imprimir automáticamente el ticket de cada pedido nuevo (impresora térmica).
import { esc, api, toast, clock, mins, topbar } from './common.js';

const root = document.getElementById('app');
const pickup = document.body.classList.contains('pickup');
const COLS = [['paid', 'Nuevos'], ['preparing', 'Preparando'], ['ready', 'Listos para entregar']];
const NEXT_LABEL = { paid: 'Empezar', preparing: 'Marcar listo', ready: 'Entregado' };
let autoPrint = localGet('mesa-autoprint') === '1';
const printed = new Set();

function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }

async function refresh() {
  let orders;
  try { orders = await api('staff/orders?status=paid,preparing,ready'); }
  catch (err) { root.innerHTML = `<main class="narrow"><p class="bad">${esc(err.message)}</p></main>`; return; }
  if (pickup) return renderPickup(orders);
  if (autoPrint) for (const o of orders.filter((x) => x.status === 'paid' && !x.printed_at && !printed.has(x.id))) printTicket(o.id);
  render(orders);
}

function render(orders) {
  const now = Date.now();
  root.innerHTML = `${topbar('Pase · ' + new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' }),
    `<label class="small" style="margin:0;display:flex;gap:8px;align-items:center"><input type="checkbox" id="ap" ${autoPrint ? 'checked' : ''} style="width:auto"> Imprimir tickets nuevos</label>`)}
  <div class="board">${COLS.map(([st, title]) => {
    const list = orders.filter((o) => o.status === st);
    return `<section class="col"><h2>${title}<span>${list.length}</span></h2>${list.map((o) => {
      const since = o[{ paid: 'created_at', preparing: 'preparing_at', ready: 'ready_at' }[st]] || o.created_at;
      const late = (st !== 'ready' && now - o.created_at > 15 * 60_000) || (st === 'ready' && now - since > 8 * 60_000);
      return `<button class="ticket ${late ? 'late' : ''}" data-id="${o.id}">
        <div style="display:flex;justify-content:space-between;align-items:center"><span class="code">${esc(o.code)}</span><span class="small muted">${o.channel === 'web' ? '📱 precompra' : '🖐️ kiosco'}</span></div>
        <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul>
        <div class="meta"><span>${esc(o.employee?.name || 'Mostrador')} · ${clock(o.created_at)}</span><span>${mins(now - since)} min · <b>${NEXT_LABEL[st]} →</b></span></div></button>`;
    }).join('') || '<p class="empty">Sin pedidos</p>'}</section>`;
  }).join('')}</div>`;
  root.querySelectorAll('.ticket').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api(`staff/orders/${b.dataset.id}/advance`, { method: 'POST', body: {} }); }
    catch (err) { toast(err.message); }
    refresh();
  }));
  document.getElementById('ap').onchange = (e) => { autoPrint = e.target.checked; localSet('mesa-autoprint', autoPrint ? '1' : '0'); };
}

// Imprime el ticket en un iframe oculto (la impresora térmica debe ser la predeterminada).
function printTicket(id) {
  printed.add(id);
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
  f.src = `ticket/${id}`;
  document.body.append(f);
  setTimeout(() => f.replaceWith(), 60_000);
}

function renderPickup(orders) {
  const codes = (st) => orders.filter((o) => st.includes(o.status)).map((o) => `<span>${esc(o.code)}</span>`).join('') || '<p class="muted">—</p>';
  root.innerHTML = `<div class="k-head"><img src="assets/mesa-mark.svg" width="44" height="44" alt=""><h1 style="margin:0">Tu pedido</h1></div>
  <div class="board"><section class="col"><h2>En preparación</h2><div class="pickup-codes">${codes(['paid', 'preparing'])}</div></section>
  <section class="col"><h2>✅ Listo, pasa por él</h2><div class="pickup-codes ready">${codes(['ready'])}</div></section></div>`;
}

refresh();
setInterval(refresh, 5000);
