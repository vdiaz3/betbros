// Kiosco Ford IM: QR rotativo cada 30 s, 3 vehículos, ES/EN y agente de voz ElevenLabs.
const ELEVEN_SDK = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm';
const IDLE_MS = 60_000; // sin interacción → modo exhibición (rota vehículos)
const VOICE_MAX_MS = 5 * 60_000; // tope de duración de cada conversación de voz

const I18N = {
  es: {
    discover: 'Descubre', scan: 'Escanea con la cámara de tu celular',
    scanSub: 'y continúa por WhatsApp: video, precios, promociones y crédito.',
    talk: 'Habla con nuestro asesor virtual', privacy: 'Al escanear podrás consultar el aviso de privacidad en el chat.',
    reconnecting: 'Reconectando…', connecting: 'Conectando…', listening: 'Te escucho…', speaking: 'Hablando…',
    end: 'Terminar', micNote: 'Usamos el micrófono sólo durante esta conversación. No se graba video.',
    voiceHint: '¿Prefieres seguir en tu celular? Escanea el código:', micDenied: 'No pudimos acceder al micrófono.',
    from: 'Desde', error: 'El asesor no está disponible. Intenta de nuevo.',
  },
  en: {
    discover: 'Discover', scan: 'Scan with your phone camera',
    scanSub: 'and continue on WhatsApp: video, prices, promotions and financing.',
    talk: 'Talk to our virtual advisor', privacy: 'After scanning, the privacy notice is available in the chat.',
    reconnecting: 'Reconnecting…', connecting: 'Connecting…', listening: 'Listening…', speaking: 'Speaking…',
    end: 'End', micNote: 'The microphone is only used during this conversation. No video is recorded.',
    voiceHint: 'Prefer to continue on your phone? Scan the code:', micDenied: 'We could not access the microphone.',
    from: 'From', error: 'The advisor is unavailable. Please try again.',
  },
};

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const kioskId = location.pathname.split('/k/')[1]?.split('/')[0] || localStorage.getItem('kioskId');
const kioskKey = params.get('key') || localStorage.getItem('kioskKey');
if (params.get('key')) {
  // La llave se guarda en el equipo y se quita de la URL visible.
  localStorage.setItem('kioskId', kioskId);
  localStorage.setItem('kioskKey', kioskKey);
  history.replaceState(null, '', `k/${kioskId}`); // relativo a <base>
}

const state = { lang: 'es', vehicles: [], idx: 0, lastTouch: Date.now(), qrTimer: null, ringAnim: null, conv: null, voiceTimer: null, qrSvg: '' };

const api = (p, opts = {}) =>
  fetch(p, { ...opts, headers: { 'x-kiosk-id': kioskId, 'x-kiosk-key': kioskKey, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));

const tr = (k) => I18N[state.lang][k] ?? k;
const loc = (v) => (v && typeof v === 'object' ? v[state.lang] ?? v.es : v);

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === state.lang));
}

function renderVehicle() {
  const v = state.vehicles[state.idx];
  document.documentElement.style.setProperty('--accent', v.accent || '#1f4e8c');
  $('vehicleName').textContent = loc(v.name);
  $('vehicleTagline').textContent = loc(v.tagline) || '';
  $('vehiclePrice').textContent = v.price_from_mxn ? `${tr('from')} $${v.price_from_mxn.toLocaleString('es-MX')} MXN*` : '';
  const img = $('heroImg');
  img.classList.add('empty');
  img.style.backgroundImage = '';
  const probe = new Image();
  probe.onload = () => { img.style.backgroundImage = `url("${v.hero_image}")`; img.classList.remove('empty'); };
  probe.src = v.hero_image;
  $('picker').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === state.idx));
}

function renderPicker() {
  $('picker').innerHTML = '';
  state.vehicles.forEach((v, i) => {
    const b = document.createElement('button');
    b.textContent = loc(v.name);
    b.onclick = () => select(i);
    $('picker').append(b);
  });
}

function select(i) {
  state.idx = i;
  renderVehicle();
  refreshQr();
}

function startCountdown(ms) {
  const ring = $('countdownRing');
  state.ringAnim?.cancel();
  state.ringAnim = ring.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 301.6 }], { duration: ms, easing: 'linear', fill: 'forwards' });
}

// Pide un QR nuevo; si falla, difumina el código: nunca se muestra uno vencido.
async function refreshQr() {
  clearTimeout(state.qrTimer);
  const v = state.vehicles[state.idx];
  try {
    const q = await api(`api/qr?vehicle=${encodeURIComponent(v.id)}&lang=${state.lang}`);
    $('qr').classList.add('swap');
    setTimeout(() => {
      $('qr').innerHTML = q.svg;
      $('qrMini').innerHTML = q.svg;
      $('qr').classList.remove('swap');
    }, 200);
    $('qrWrap').classList.remove('offline');
    startCountdown(q.rotateInMs);
    state.qrTimer = setTimeout(onQrCycle, q.rotateInMs);
  } catch (err) {
    console.warn('QR', err);
    $('qrWrap').classList.add('offline');
    state.qrTimer = setTimeout(refreshQr, 5000);
  }
}

// En modo exhibición, cada ciclo de QR avanza al siguiente vehículo.
function onQrCycle() {
  if (!state.conv && Date.now() - state.lastTouch > IDLE_MS) {
    state.idx = (state.idx + 1) % state.vehicles.length;
    renderVehicle();
  }
  refreshQr();
}

// --- Agente de voz (ElevenLabs Conversational AI) ----------------------------------------
function line(text, who) {
  const p = document.createElement('p');
  p.className = who;
  p.textContent = text;
  $('transcript').append(p);
  $('transcript').scrollTop = 1e6;
}

async function startVoice() {
  if (state.conv) return;
  $('voice').hidden = false;
  $('transcript').innerHTML = '';
  $('voiceStatus').textContent = tr('connecting');
  const v = state.vehicles[state.idx];
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    $('voiceStatus').textContent = tr('micDenied');
    return;
  }
  try {
    const [{ Conversation }, { signedUrl }] = await Promise.all([
      import(ELEVEN_SDK),
      api('api/eleven/session', { method: 'POST', body: JSON.stringify({ vehicle: v.id, lang: state.lang }) }),
    ]);
    state.conv = await Conversation.startSession({
      signedUrl,
      // Variables dinámicas disponibles en el prompt del agente: {{vehicle}}, {{lang}}, {{dealer}}…
      dynamicVariables: { vehicle: loc(v.name), vehicle_id: v.id, lang: state.lang, dealer: $('dealerName').textContent, kiosk_id: kioskId },
      overrides: { agent: { language: state.lang } },
      onModeChange: ({ mode }) => {
        $('orb').className = `orb ${mode === 'speaking' ? 'speaking' : 'listening'}`;
        $('voiceStatus').textContent = tr(mode === 'speaking' ? 'speaking' : 'listening');
      },
      onMessage: ({ message, source }) => line(message, source === 'user' ? 'user' : 'ai'),
      onDisconnect: () => endVoice(),
      onError: (e) => { console.warn('voice', e); $('voiceStatus').textContent = tr('error'); },
    });
    state.voiceTimer = setTimeout(endVoice, VOICE_MAX_MS);
  } catch (err) {
    console.warn('voice', err);
    $('voiceStatus').textContent = tr('error');
    state.conv = null;
  }
}

async function endVoice() {
  clearTimeout(state.voiceTimer);
  const c = state.conv;
  state.conv = null;
  try { await c?.endSession(); } catch { /* ya cerrada */ }
  $('voice').hidden = true;
  $('orb').className = 'orb';
}

// --- Arranque ----------------------------------------------------------------------------
async function boot() {
  if (!kioskId || !kioskKey) {
    document.body.innerHTML = '<p style="padding:40px;font-size:24px">Kiosco no configurado: abre k/&lt;ID&gt;?key=&lt;LLAVE&gt;</p>';
    return;
  }
  document.querySelectorAll('.lang button').forEach((b) => (b.onclick = () => {
    state.lang = b.dataset.lang;
    applyI18n();
    renderPicker();
    renderVehicle();
    refreshQr();
  }));
  $('voiceBtn').onclick = startVoice;
  $('endBtn').onclick = endVoice;
  ['pointerdown', 'keydown'].forEach((e) => addEventListener(e, () => (state.lastTouch = Date.now()), { passive: true }));
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  for (;;) {
    try {
      const cfg = await api('api/config');
      state.vehicles = cfg.vehicles;
      $('dealerName').textContent = cfg.dealer?.name ?? 'Ford';
      break;
    } catch (err) {
      $('qrWrap').classList.add('offline');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  applyI18n();
  renderPicker();
  renderVehicle();
  refreshQr();
  setInterval(() => api('api/heartbeat', { method: 'POST', body: JSON.stringify({ ua: navigator.userAgent, vehicle: state.vehicles[state.idx].id }) }).catch(() => {}), 60_000);
  // Si el navegador del kiosco se suspende (pantalla apagada), al volver se pide un QR nuevo.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshQr(); });
}

boot();
