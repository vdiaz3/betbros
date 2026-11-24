// Manager de cocina: pedidos del día, menú (formulario o CSV), inventario, indicadores de
// gestión, reportes exportables y encuestas de satisfacción.
import { $, esc, money, CAT, STATUS, api, toast, dayLabel, clock, topbar } from './common.js';

const root = document.getElementById('app');
const TABS = [['pedidos', 'Pedidos'], ['menu', 'Menú'], ['inventario', 'Inventario'], ['kpis', 'Indicadores'], ['reportes', 'Reportes'], ['encuestas', 'Encuestas']];
const tz = (off = 0) => new Date(Date.now() + off * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const state = { tab: location.hash.slice(1) || 'pedidos', date: tz(), menuDate: tz(), range: [tz(-6), tz()], report: 'platillos' };

function shell(content) {
  root.innerHTML = `${topbar('Manager de cocina', `<a class="btn sm ghost" href="pase" target="_blank">Abrir pase</a>`)}
  <main class="wrap" style="margin:18px auto 60px"><div class="tabs no-print">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === state.tab ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="view" style="margin-top:18px">${content}</div></main>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; location.hash = state.tab; show(); }));
}

async function show() {
  shell('<p class="muted">Cargando…</p>');
  try { await VIEWS[state.tab](); } catch (err) { $('#view').innerHTML = `<p class="bad">${esc(err.message)}</p>`; }
}

const rangePicker = () => `<div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:14px">
  <label style="margin:0">Desde<input type="date" id="from" value="${state.range[0]}"></label><label style="margin:0">Hasta<input type="date" id="to" value="${state.range[1]}"></label>
  <button class="btn sm ghost" data-preset="0">Hoy</button><button class="btn sm ghost" data-preset="6">7 días</button><button class="btn sm ghost" data-preset="29">30 días</button></div>`;
function bindRange() {
  const apply = () => { state.range = [$('#from').value, $('#to').value]; show(); };
  $('#from').onchange = apply; $('#to').onchange = apply;
  root.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { state.range = [tz(-Number(b.dataset.preset)), tz()]; show(); }));
}

const VIEWS = {
  async pedidos() {
    const orders = await api(`staff/orders?date=${state.date}`);
    const by = (s) => orders.filter((o) => o.status === s).length;
    $('#view').innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:14px">
      <label style="margin:0">Día<input type="date" id="d" value="${state.date}"></label>
      ${Object.entries(STATUS).map(([s, l]) => `<span class="pill"><span class="status ${s}">${l}</span>: ${by(s)}</span>`).join('')}</div>
    <div class="card" style="overflow:auto"><table class="data"><thead><tr><th>Código</th><th>Hora</th><th>Colaborador</th><th>Platillos</th><th>Canal</th><th>Pago</th><th>Estado</th><th></th></tr></thead><tbody>
    ${orders.slice().reverse().map((o) => `<tr><td><b>${esc(o.code)}</b></td><td>${clock(o.created_at)}</td><td>${esc(o.employee?.name || 'Mostrador')}</td>
      <td>${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join('<br>')}</td><td>${o.channel === 'web' ? 'Precompra' : 'Kiosco'}</td>
      <td>${money(o.total)}${o.benefit_used ? `<br><span class="muted small">beneficio ${money(o.benefit_used)}</span>` : ''}</td>
      <td><span class="status ${o.status}">${STATUS[o.status]}</span></td>
      <td style="white-space:nowrap">${['paid', 'preparing', 'ready'].includes(o.status) ? `<button class="btn sm" data-adv="${o.id}">Avanzar</button>` : ''}
        ${['paid', 'preparing'].includes(o.status) ? `<button class="btn sm ghost" data-cancel="${o.id}">Cancelar</button>` : ''}
        <a class="btn sm ghost" href="ticket/${o.id}" target="_blank">🖨️</a></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin pedidos este día</td></tr>'}</tbody></table></div>`;
    $('#d').onchange = (e) => { state.date = e.target.value; show(); };
    root.querySelectorAll('[data-adv]').forEach((b) => (b.onclick = async () => { await api(`staff/orders/${b.dataset.adv}/advance`, { method: 'POST', body: {} }).catch((e) => toast(e.message)); show(); }));
    root.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
      if (!confirm('¿Cancelar el pedido? Se regresa el beneficio y el inventario.')) return;
      await api(`staff/orders/${b.dataset.cancel}/advance`, { method: 'POST', body: { to: 'cancelled' } }).catch((e) => toast(e.message)); show();
    }));
  },

  async menu() {
    const [items, week] = await Promise.all([api('staff/items'), api(`week?from=${state.menuDate}`)]);
    const day = week.days[0];
    const onMenu = Object.fromEntries(day.items.map((i) => [i.id, i]));
    $('#view').innerHTML = `<div class="grid g2" style="align-items:start">
      <section class="card"><div style="display:flex;gap:10px;align-items:end;justify-content:space-between;flex-wrap:wrap">
        <h2 style="margin:0">Menú del ${esc(dayLabel(day.date))}</h2><label style="margin:0">Día<input type="date" id="md" value="${day.date}"></label></div>
        <p class="muted small">Porciones planeadas por platillo (0 lo quita del menú). Lo vendido se descuenta solo.</p>
        <table class="data"><thead><tr><th>Platillo</th><th>Precio</th><th>Porciones</th><th>Vendidas</th></tr></thead><tbody>
        ${items.map((i) => `<tr><td>${i.emoji || ''} ${esc(i.name)} <span class="pill ${i.category}">${CAT[i.category]}</span></td><td>${money(i.price_mxn)}</td>
          <td><input type="number" min="0" step="5" value="${onMenu[i.id]?.planned_qty ?? 0}" data-plan="${i.id}" style="width:90px"></td><td>${onMenu[i.id]?.sold ?? '—'}</td></tr>`).join('')}</tbody></table></section>
      <div class="grid">
        <section class="card"><h3>Nuevo platillo</h3><form id="newItem" class="grid g2">
          <label>Nombre<input name="name" required></label><label>Categoría<select name="category">${Object.entries(CAT).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          <label>Precio (MXN)<input name="price_mxn" type="number" min="0" step="1" required></label><label>Kcal<input name="kcal" type="number" min="0"></label>
          <label style="grid-column:1/-1">Descripción<input name="description"></label>
          <label class="small" style="font-weight:500"><input type="checkbox" name="benefit_eligible" checked style="width:auto"> Aplica beneficio</label>
          <label>Emoji<input name="emoji" value="🍽️" maxlength="4"></label><button class="btn" style="grid-column:1/-1">Guardar platillo</button></form></section>
        <section class="card"><h3>Cargar menú de la semana (CSV)</h3>
          <p class="muted small">Columnas: <code>fecha,platillo,categoria,precio,porciones,descripcion,kcal</code>. Categoría: menu, premium o grab_go. Los platillos nuevos se crean solos.</p>
          <textarea id="csv" rows="6" placeholder="fecha,platillo,categoria,precio,porciones&#10;${day.date},Menú del día: chiles rellenos,menu,85,90&#10;${day.date},Premium: atún sellado,premium,170,20"></textarea>
          <p style="display:flex;gap:8px;flex-wrap:wrap"><input type="file" id="csvFile" accept=".csv,text/csv" style="flex:1"><button class="btn" id="loadCsv">Cargar</button></p></section>
      </div></div>`;
    $('#md').onchange = (e) => { state.menuDate = e.target.value; show(); };
    root.querySelectorAll('[data-plan]').forEach((inp) => (inp.onchange = async () => {
      try { await api('staff/menu', { method: 'POST', body: { date: day.date, item_id: inp.dataset.plan, planned_qty: Number(inp.value) } }); toast('Menú actualizado'); }
      catch (err) { toast(err.message); }
    }));
    $('#newItem').onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try { await api('staff/items', { method: 'POST', body: { ...f, benefit_eligible: Boolean(f.benefit_eligible), kcal: f.kcal ? Number(f.kcal) : null } }); toast('Platillo guardado'); show(); }
      catch (err) { toast(err.message); }
    };
    $('#csvFile').onchange = async (e) => { $('#csv').value = await e.target.files[0].text(); };
    $('#loadCsv').onclick = async () => {
      const r = await api('staff/menu/csv', { method: 'POST', text: $('#csv').value }).catch((err) => ({ loaded: 0, errors: [{ error: err.message }] }));
      toast(`${r.loaded} línea(s) cargadas${r.errors.length ? `, ${r.errors.length} con error` : ''}`);
      if (r.loaded) show();
    };
  },

  async inventario() {
    const list = await api('staff/inventory');
    $('#view').innerHTML = `<div class="card" style="overflow:auto"><p class="muted small">Los pedidos descuentan insumos según la receta de cada platillo; las cancelaciones los regresan.</p>
    <table class="data"><thead><tr><th>Insumo</th><th>Existencia</th><th>Mínimo</th><th>Costo</th><th>Estado</th><th>Movimiento</th></tr></thead><tbody>
    ${list.map((g) => `<tr><td>${esc(g.name)}</td><td><b>${g.stock}</b> ${esc(g.unit)}</td><td>${g.min_stock} ${esc(g.unit)}</td><td>${money(g.unit_cost)}/${esc(g.unit)}</td>
      <td>${g.low ? '<span class="bad">⚠️ Reabastecer</span>' : '<span class="ok">OK</span>'}</td>
      <td style="white-space:nowrap"><input type="number" step="0.1" min="0" data-q="${g.id}" style="width:90px;display:inline-block">
        <button class="btn sm" data-in="${g.id}">Entrada</button><button class="btn sm ghost" data-out="${g.id}">Merma</button></td></tr>`).join('')}</tbody></table></div>`;
    const move = async (id, reason) => {
      const qty = Number(root.querySelector(`[data-q="${id}"]`).value);
      if (!qty) return toast('Escribe la cantidad');
      await api(`staff/inventory/${id}/move`, { method: 'POST', body: { qty, reason } }).catch((e) => toast(e.message)); show();
    };
    root.querySelectorAll('[data-in]').forEach((b) => (b.onclick = () => move(b.dataset.in, 'entrada')));
    root.querySelectorAll('[data-out]').forEach((b) => (b.onclick = () => move(b.dataset.out, 'merma')));
  },

  async kpis() {
    const k = await api(`staff/kpis?from=${state.range[0]}&to=${state.range[1]}`);
    const pct = (v) => (v == null ? '—' : `${v}%`);
    const maxItem = Math.max(1, ...k.top_items.map((i) => i.qty));
    const maxHour = Math.max(1, ...k.by_hour.map((h) => h.n));
    $('#view').innerHTML = `${rangePicker()}
    <div class="grid g4">${[
      ['Pedidos', k.orders], ['Porciones vendidas', k.portions], ['Ventas', money(k.revenue_mxn)], ['Ticket promedio', k.avg_ticket_mxn == null ? '—' : money(k.avg_ticket_mxn)],
      ['Aprovechamiento del menú', pct(k.sell_through)], ['Sobrantes (porciones)', `${k.leftovers}`], ['Costo estimado de sobrantes', money(k.leftover_cost_mxn)], ['Pagado con beneficio', pct(k.benefit_share)],
      ['Precompra en portal', pct(k.preorder_share)], ['Preparación promedio', k.avg_prep_min == null ? '—' : `${k.avg_prep_min} min`], ['Tiempo en piso promedio', k.avg_floor_min == null ? '—' : `${k.avg_floor_min} min`], ['Pedidos en curso ahora', k.pending_now],
      ['Satisfacción', k.csat == null ? '—' : `${k.csat} / 5`], ['Satisfechos (4–5 ⭐)', pct(k.csat_pct)], ['Respuesta de encuestas', pct(k.survey_response_rate)], ['Insumos bajo mínimo', k.low_stock],
    ].map(([l, v]) => `<div class="card kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
    <div class="grid g2" style="margin-top:14px">
      <section class="card"><h3>Platillos más pedidos</h3><div class="bars">${k.top_items.map((i) => `<div class="bar"><span>${esc(i.name.replace(/^.*?: /, ''))}</span><i style="width:${(i.qty / maxItem) * 100}%"></i><b>${i.qty}</b></div>`).join('') || '<p class="muted">Sin datos</p>'}</div></section>
      <section class="card"><h3>Pedidos por hora</h3><div class="hours">${k.by_hour.map((h) => `<div><i style="height:${(h.n / maxHour) * 100}%"></i>${h.h}h</div>`).join('')}</div></section></div>`;
    bindRange();
  },

  async reportes() {
    const rows = await api(`staff/report/${state.report}?from=${state.range[0]}&to=${state.range[1]}`);
    const cols = rows[0] ? Object.keys(rows[0]) : [];
    $('#view').innerHTML = `${rangePicker()}<div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${[['platillos', 'Platillos'], ['tiempos', 'Tiempos (preparación y en piso)'], ['satisfaccion', 'Satisfacción'], ['inventario', 'Inventario']].map(([k, l]) => `<button class="btn sm ${k === state.report ? '' : 'ghost'}" data-rep="${k}">${l}</button>`).join('')}
      <div class="spacer"></div><a class="btn sm warm" href="api/staff/report/${state.report}?from=${state.range[0]}&to=${state.range[1]}&format=csv">⬇ CSV</a><button class="btn sm ghost" onclick="print()">🖨️ Imprimir</button></div>
    <div class="card" style="overflow:auto"><table class="data"><thead><tr>${cols.map((c) => `<th>${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice(0, 500).map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('') || '<tr><td class="empty">Sin datos en el periodo</td></tr>'}</tbody></table>
    ${rows.length > 500 ? `<p class="muted small">Mostrando 500 de ${rows.length}; descarga el CSV para verlo completo.</p>` : ''}</div>`;
    bindRange();
    root.querySelectorAll('[data-rep]').forEach((b) => (b.onclick = () => { state.report = b.dataset.rep; show(); }));
  },

  async encuestas() {
    const [answers, mails] = await Promise.all([api(`staff/report/satisfaccion?from=${state.range[0]}&to=${state.range[1]}`), api('staff/outbox')]);
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
    $('#view').innerHTML = `${rangePicker()}<div class="grid g2" style="align-items:start">
      <section class="card"><h3>Lo que dicen los colaboradores (${answers.length})</h3>${answers.slice(0, 60).map((a) => `<div style="padding:10px 0;border-top:1px solid var(--line)">
        <b style="color:var(--warm)">${stars(a.calificacion)}</b> <span class="muted small">${esc(a.fecha)} · ${esc(a.area || '')}</span>
        ${a.le_gusto ? `<p class="small" style="margin:4px 0">👍 ${esc(a.le_gusto.replace(/,/g, ', '))}</p>` : ''}${a.no_le_gusto ? `<p class="small" style="margin:4px 0">👎 ${esc(a.no_le_gusto)}</p>` : ''}
        ${a.mejorar ? `<p class="small" style="margin:4px 0">💡 ${esc(a.mejorar)}</p>` : ''}</div>`).join('') || '<p class="muted">Sin respuestas en el periodo.</p>'}</section>
      <section class="card"><h3>Correos de encuesta enviados</h3><p class="muted small">Se envían al marcar un pedido como entregado. Sin servidor de correo configurado (demo), quedan aquí con su liga.</p>
        ${mails.map((m) => `<div style="padding:8px 0;border-top:1px solid var(--line)"><b class="small">${esc(m.subject)}</b><br><span class="muted small">${esc(m.to_email)} · ${clock(m.created_at)} · ${m.delivered ? 'enviado' : 'en bandeja demo'}</span>
          ${m.url ? ` · <a class="small" href="${esc(m.url)}" target="_blank">abrir encuesta</a>` : ''}</div>`).join('') || '<p class="muted">Aún no hay correos. Entrega un pedido en el pase para generar uno.</p>'}</section></div>`;
    bindRange();
  },
};

show();
