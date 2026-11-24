// Encuesta de satisfacción (liga del correo que recibe el colaborador al entregar su pedido).
import { $, esc, api, dayLabel, topbar } from './common.js';

const root = document.getElementById('app');
const id = root.dataset.id;
const LIKED = ['sabor', 'porción', 'temperatura', 'presentación', 'rapidez', 'variedad', 'precio'];
const state = { rating: 0, liked: new Set() };

async function boot() {
  let s;
  try { s = await api(`survey/${encodeURIComponent(id)}`); }
  catch { return done('Esta encuesta no existe o ya venció.'); }
  if (s.answered) return done('¡Gracias! Ya habías respondido esta encuesta.');
  render(s);
}

function render(s) {
  root.innerHTML = `${topbar('Tu opinión')}<main class="narrow"><div class="card">
    <h1>${s.name ? `${esc(s.name)}, ¿qué` : '¿Qué'} tal tu comida?</h1>
    <p class="muted">${esc(dayLabel(s.date))}: ${s.items.map((i) => `${i.emoji || ''} ${esc(i.name)}`).join(', ')}</p>
    <p><b>Califícala</b></p><div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button data-r="${n}" class="${n <= state.rating ? 'on' : ''}" aria-label="${n} estrellas">⭐</button>`).join('')}</div>
    <p><b>¿Qué te gustó?</b></p><div class="chips">${LIKED.map((l) => `<button data-l="${l}" class="${state.liked.has(l) ? 'on' : ''}">${l}</button>`).join('')}</div>
    <label>¿Qué no te gustó?<textarea id="dis" rows="2" maxlength="600"></textarea></label>
    <label>¿Qué podemos mejorar?<textarea id="imp" rows="2" maxlength="600"></textarea></label>
    <button class="btn block" id="send" ${state.rating ? '' : 'disabled'}>Enviar</button></div></main>`;
  root.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { state.rating = Number(b.dataset.r); keep(s); }));
  root.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { state.liked.has(b.dataset.l) ? state.liked.delete(b.dataset.l) : state.liked.add(b.dataset.l); keep(s); }));
  $('#send').onclick = async () => {
    try {
      await api(`survey/${encodeURIComponent(id)}`, { method: 'POST', body: { rating: state.rating, liked: [...state.liked], disliked: $('#dis').value, improve: $('#imp').value } });
      done('¡Gracias! Tu opinión llega directo a la cocina.');
    } catch (err) { done(err.message); }
  };
}

// Vuelve a pintar sin perder lo que ya escribió.
function keep(s) {
  const dis = $('#dis').value;
  const imp = $('#imp').value;
  render(s);
  $('#dis').value = dis;
  $('#imp').value = imp;
}

function done(msg) {
  root.innerHTML = `${topbar('Tu opinión')}<main class="narrow"><div class="card" style="text-align:center"><p style="font-size:54px;margin:0">🙌</p><h1>${esc(msg)}</h1></div></main>`;
}

boot();
