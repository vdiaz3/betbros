// Bandeja del vendedor: conversaciones en vivo (polling cada 4 s), funnel y agenda.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const api = (p, opts = {}) => fetch(`api${p}`, { ...opts, headers: { 'Content-Type': 'application/json', 'x-fim': '1', ...(opts.headers || {}) } })
  .then(async (r) => { const j = await r.json().catch(() => ({})); if (r.status === 401) location.href = 'login'; if (!r.ok) throw Object.assign(new Error(j.error || r.status), { body: j }); return j; });

const STAGE = {
  scanned: 'Escaneó', chatting: 'Conversando', test_drive_booked: 'Prueba agendada', credit_consent: 'Aviso de crédito', kyc: 'KYC',
  credit_collecting: 'Capturando datos', signing: 'Firma pendiente', sent_to_bank: 'En banco', bank_more_info: 'Banco pide info',
  bank_approved: 'Aprobado', bank_rejected: 'No aprobado', closed: 'Cerrado',
};
const KYC = { pending: 'Pendiente', submitted: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', review: 'En revisión' };
const CREDIT = { collecting: 'Capturando datos', ready: 'Lista para firma', signing: 'Firma pendiente', sent_to_bank: 'Enviada al banco', bank_more_info: 'Banco pide información', bank_approved: 'Aprobado', bank_rejected: 'No aprobado' };
const TD = { booked: 'Agendada', done: 'Realizada', no_show: 'No asistió', cancelled: 'Cancelada', rescheduled: 'Reprogramada' };
const DOC = { ine: 'INE', pasaporte: 'Pasaporte' };
const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
const time = (t) => new Date(t).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
const money = (n) => (n ? `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : '—');

const state = { filter: 'all', q: '', current: null, lastMsgId: 0, me: null };

// --- Navegación --------------------------------------------------------------------------
function show(view) {
  for (const v of ['inbox', 'funnel', 'agenda']) $(v).hidden = v !== view;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.view === view));
  if (view === 'funnel') loadFunnel();
  if (view === 'agenda') loadAgenda();
}
document.querySelectorAll('.tabs a').forEach((a) => (a.onclick = (e) => { e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); show(a.dataset.view); }));
addEventListener('popstate', () => route());
const route = () => show(location.pathname.endsWith('/funnel') ? 'funnel' : location.pathname.endsWith('/agenda') ? 'agenda' : 'inbox');

// --- Bandeja -----------------------------------------------------------------------------
async function loadConvs() {
  const rows = await api(`/conversations?filter=${state.filter}&q=${encodeURIComponent(state.q)}`);
  $('convs').innerHTML = rows.map((c) => `
    <li data-id="${c.id}" class="${c.id === state.current ? 'on' : ''}">
      <div class="top"><span>${esc(c.name || c.wa_id)}</span><span class="sub">${ago(c.last_inbound_at || c.updated_at)}</span></div>
      <div class="sub">${c.last_dir === 'in' ? '' : '↩ '}${esc(c.last_body || '')}</div>
      <div class="sub">${c.bot_paused ? `<span class="badge hand">👤 ${esc(c.assigned_to || 'asesor')}</span>` : '<span class="badge bot">🤖 bot</span>'}
        <span class="badge">${esc(STAGE[c.stage] || c.stage)}</span> ${c.vehicle ? `<span class="badge">${esc(c.vehicle)}</span>` : ''}</div>
    </li>`).join('') || '<li class="sub">Sin conversaciones</li>';
  $('convs').querySelectorAll('li[data-id]').forEach((li) => (li.onclick = () => openConv(li.dataset.id)));
}

async function openConv(id) {
  state.current = id;
  state.lastMsgId = 0;
  $('chat').innerHTML = `<header id="chatHead"></header><div class="msgs" id="msgs"></div><div class="notice" id="notice"></div>
    <form class="compose" id="compose"><textarea id="text" placeholder="Escribe al cliente… (al enviar, tomas la conversación y se pausa el bot)"></textarea><button class="btn">Enviar</button></form>`;
  if (state.me.read_only) $('compose').innerHTML = '<p class="sub" style="margin:0">Vista de sólo lectura (demo): las respuestas se envían desde el CRM operativo.</p>';
  $('compose').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('text').value.trim();
    if (!text) return;
    try { await api(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }); $('text').value = ''; refreshConv(); }
    catch (err) { $('notice').textContent = err.body?.hint || `No se envió: ${err.message}`; }
  };
  if ($('text')) $('text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('compose').requestSubmit(); } };
  await refreshConv();
  loadConvs();
}

async function refreshConv() {
  if (!state.current) return;
  const id = state.current;
  const d = await api(`/conversations/${id}?after=${state.lastMsgId}`);
  if (id !== state.current) return;
  const s = d.session;
  $('chatHead').innerHTML = `<div><b>${esc(s.name || s.wa_id)}</b> <span class="sub">+${esc(s.wa_id)} · ref ${esc(s.ref)} · ${s.lang.toUpperCase()}</span></div>
    <div>${s.bot_paused
      ? `<span class="badge hand">👤 Atiende ${esc(s.assigned_to || 'asesor')}</span>${state.me.read_only ? '' : ' <button class="btn sm ghost" id="release">Devolver al bot</button>'}`
      : `<span class="badge bot">🤖 Atiende el bot</span>${state.me.read_only ? '' : ' <button class="btn sm" id="take">Tomar conversación</button>'}`}</div>`;
  $('take')?.addEventListener('click', async () => { await api(`/conversations/${id}/take`, { method: 'POST' }); refreshConv(); loadConvs(); });
  $('release')?.addEventListener('click', async () => { await api(`/conversations/${id}/release`, { method: 'POST' }); refreshConv(); loadConvs(); });
  $('notice').textContent = d.window_open ? '' : '⚠️ Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp sólo permite plantillas aprobadas.';

  const box = $('msgs');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  for (const m of d.messages) {
    const who = m.direction === 'in' ? 'Cliente' : m.author === 'bot' ? '🤖 Bot' : m.author.startsWith('seller:') ? `👤 ${m.author.slice(7)}` : '⚙️ Sistema';
    box.insertAdjacentHTML('beforeend', `<div class="msg ${m.direction} ${m.author.startsWith('seller') ? 'seller' : ''}">${esc(m.body)}<span class="meta">${who} · ${time(m.created_at)}</span></div>`);
    state.lastMsgId = Math.max(state.lastMsgId, m.id);
  }
  if (atBottom || d.messages.length) box.scrollTop = box.scrollHeight;

  const c = d.credit;
  $('side').innerHTML = `
    <h3>Cliente</h3><dl><dt>Vehículo</dt><dd>${esc(d.vehicle || '—')}</dd><dt>Distribuidor</dt><dd>${esc(d.dealer || '—')}</dd>
      <dt>Etapa</dt><dd>${esc(STAGE[s.stage] || s.stage)}</dd><dt>Correo</dt><dd>${esc(s.email || '—')}</dd></dl>
    <h3>Prueba de manejo</h3>${d.test_drive ? `<dl><dt>Cuándo</dt><dd>${esc(d.test_drive.when)}</dd><dt>Estado</dt><dd>${esc(TD[d.test_drive.status] || d.test_drive.status)}</dd></dl>` : '<p class="sub">Sin agendar</p>'}
    <h3>Privacidad</h3><dl><dt>Aviso general</dt><dd>${d.consents.includes('privacy_notice_delivered') ? '✓ entregado' : '—'}</dd>
      <dt>Aviso crédito</dt><dd>${d.consents.includes('credit_privacy') ? '✓ ACEPTO' : '—'}</dd></dl>
    <h3>KYC</h3>${d.kyc ? `<dl><dt>Estado</dt><dd>${esc(KYC[d.kyc.status] || d.kyc.status)}</dd><dt>Documento</dt><dd>${esc(DOC[d.kyc.doc_type] || '—')}</dd></dl>` : '<p class="sub">No iniciado</p>'}
    <h3>Crédito</h3>${c ? `<dl><dt>Folio</dt><dd>${esc(c.folio)}</dd><dt>Banco</dt><dd>${esc(c.bank)}</dd><dt>Estado</dt><dd>${esc(CREDIT[c.status] || c.status)}</dd>
      <dt>Mensualidad</dt><dd>${money(c.monthly)}</dd><dt>Faltantes</dt><dd>${c.missing}</dd></dl>` : '<p class="sub">Sin solicitud</p>'}
    ${state.me?.crm_url && s.crm_opportunity_id ? `<p><a target="_blank" href="${esc(state.me.crm_url)}/object/opportunity/${esc(s.crm_opportunity_id)}">Abrir en CRM ↗</a></p>` : ''}`;
}

document.querySelectorAll('.chips button').forEach((b) => (b.onclick = () => {
  state.filter = b.dataset.filter;
  document.querySelectorAll('.chips button').forEach((x) => x.classList.toggle('on', x === b));
  loadConvs();
}));
let qTimer;
$('q').oninput = (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; loadConvs(); }, 250); };

// --- Funnel ------------------------------------------------------------------------------
const tip = $('tip');
function tooltip(el, html) {
  el.onmousemove = (e) => { tip.hidden = false; tip.innerHTML = html; tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 14}px`; };
  el.onmouseleave = () => (tip.hidden = true);
}

async function loadFunnel() {
  const d = await api(`/funnel?days=${$('days').value}`);
  const t = d.tiles;
  const first = d.funnel[0]?.count || 0;
  const last = d.funnel.at(-1)?.count || 0;
  $('tiles').innerHTML = [
    [first, 'Escaneos del QR'],
    [d.funnel[1]?.count ?? 0, 'Conversaciones'],
    [t.test_drives_booked, 'Pruebas de manejo agendadas'],
    [last, 'Créditos aprobados'],
    [first ? `${((last / first) * 100).toFixed(1)}%` : '—', 'Conversión QR → aprobado'],
  ].map(([n, l]) => `<div class="tile"><b>${n}</b><span>${l}</span></div>`).join('');

  const max = Math.max(1, ...d.funnel.map((f) => f.count));
  $('funnelChart').innerHTML = d.funnel.map((f, i) => {
    const prev = i ? d.funnel[i - 1].count : null;
    const step = prev ? `${Math.round((f.count / prev) * 100)}% del paso anterior` : '';
    return `<div class="row" data-i="${i}"><span class="lbl">${esc(f.label)}</span>
      <div class="track"><div class="fill" style="width:${(f.count / max) * 100}%"></div></div>
      <span class="num"><b>${f.count}</b>${step ? `<small>${step}</small>` : ''}</span></div>`;
  }).join('');
  $('funnelChart').querySelectorAll('.row').forEach((row) => {
    const f = d.funnel[row.dataset.i];
    tooltip(row, `<b>${esc(f.label)}</b><br>${f.count} leads · ${first ? ((f.count / first) * 100).toFixed(1) : 0}% de los escaneos`);
  });

  $('kanban').innerHTML = d.columns.map((c) => `<div class="col"><h4><span>${esc(c.label)}</span><span>${c.leads.length}</span></h4>
    ${c.leads.slice(0, 30).map((l) => `<div class="lead" data-id="${l.id}">${esc(l.name)}<small>${esc(l.vehicle || '')} · ${l.bot_paused ? `👤 ${esc(l.assigned_to || '')}` : '🤖'} · ${ago(l.updated_at)}</small></div>`).join('')}</div>`).join('');
  $('kanban').querySelectorAll('.lead').forEach((el) => (el.onclick = () => { history.pushState(null, '', './'); show('inbox'); openConv(el.dataset.id); }));
}
$('days').onchange = loadFunnel;

// --- Agenda ------------------------------------------------------------------------------
async function loadAgenda() {
  const rows = await api('/agenda');
  $('agendaList').innerHTML = rows.map((r) => `<div class="agenda-row">
      <div><b>${esc(r.when)}</b><br><span class="sub">${esc(r.vehicle)} · ${esc(r.dealer || '')}</span></div>
      <div><a href="#" data-open="${r.session_id}">${esc(r.name)}</a></div>
      <div><span class="badge">${esc({ booked: 'Agendada', done: 'Realizada', no_show: 'No asistió' }[r.status] || r.status)}</span></div>
      <div>${r.status === 'booked' && !state.me.read_only ? `<button class="btn sm" data-td="${r.id}" data-s="done">Realizada</button> <button class="btn sm ghost" data-td="${r.id}" data-s="no_show">No asistió</button>` : ''}</div>
    </div>`).join('') || '<p class="sub">No hay pruebas de manejo próximas.</p>';
  $('agendaList').querySelectorAll('[data-td]').forEach((b) => (b.onclick = async () => { await api(`/test-drives/${b.dataset.td}`, { method: 'POST', body: JSON.stringify({ status: b.dataset.s }) }); loadAgenda(); }));
  $('agendaList').querySelectorAll('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); history.pushState(null, '', './'); show('inbox'); openConv(a.dataset.open); }));
}

// --- Arranque ----------------------------------------------------------------------------
state.me = await api('/me');
$('me').textContent = state.me.name;
$('demoTag').hidden = !state.me.demo;
$('roTag').hidden = !state.me.read_only;
if (state.me.read_only) {
  $('logout').hidden = true;
  document.querySelector('[data-filter="mine"]').hidden = true;
}
if (state.me.crm_url) { $('crmLink').hidden = false; $('crmLink').href = state.me.crm_url; }
route();
loadConvs();
setInterval(() => { if (!$('inbox').hidden) { loadConvs(); refreshConv(); } }, 4000);
