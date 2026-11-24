// Utilidades compartidas de Vamo Mesa (todas las páginas son módulos ES sin compilar).
export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const CAT = { menu: 'Menú del día', premium: 'Premium', grab_go: 'Grab & go' };
export const STATUS = { paid: 'Pagado', preparing: 'En preparación', ready: 'Listo para recoger', delivered: 'Entregado', cancelled: 'Cancelado' };
export const ERR = {
  invalid_credentials: 'Número de empleado o NIP incorrecto.', login_required: 'Inicia sesión.', sold_out: 'Ya no hay suficientes porciones de ese platillo.',
  item_not_on_menu: 'Ese platillo no está en el menú de ese día.', empty_order: 'Agrega al menos un platillo.', cannot_cancel: 'El pedido ya está en cocina.',
  employee_required: 'Identifícate para usar tu beneficio.', staff_required: 'Sesión del personal vencida: abre la liga del comedor otra vez.',
};

export async function api(path, { method = 'GET', body, text } = {}) {
  const headers = text != null ? { 'Content-Type': 'text/plain' } : body ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(`api/${path}`, { method, headers, body: text != null ? text : body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error(ERR[data?.error] || data?.error || `HTTP ${res.status}`), { code: data?.error, status: res.status });
  return data;
}

export function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.replaceWith(), ms);
}

export const dayLabel = (date, opts = { weekday: 'long', day: 'numeric', month: 'short' }) =>
  new Date(`${date}T12:00:00-06:00`).toLocaleDateString('es-MX', { ...opts, timeZone: 'America/Mexico_City' });
export const clock = (ms) => (ms ? new Date(ms).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }) : '—');
export const mins = (ms) => Math.max(0, Math.round(ms / 60_000));
export const topbar = (subtitle, right = '') =>
  `<header class="topbar"><a class="brand" href="./"><img src="assets/mesa-mark.svg" alt="" width="30" height="30"><span>vamo mesa<br><small>${esc(subtitle)}</small></span></a><div class="spacer"></div>${right}</header>`;
