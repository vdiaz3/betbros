// KYC desde el celular: 1) consentimiento y tipo de documento, 2) foto del documento,
// 3) prueba de vida con 3 retos, 4) CURP y envío, 5) resultado del análisis.
const boot = JSON.parse(document.getElementById('boot').textContent);
const L = boot.lang === 'en' ? 'en' : 'es';
const root = document.getElementById('kyc');

const T = {
  es: {
    title: 'Verificación de identidad', intro: 'Antes de tu solicitud de crédito verificamos tu identidad. Toma unos 2 minutos.',
    demo: 'Modo demostración: la verificación es simulada.',
    consent: 'Otorgo mi consentimiento expreso para el tratamiento de mi identificación oficial y de mis datos biométricos (rostro) con el fin de verificar mi identidad, conforme al',
    notice: 'Aviso de Privacidad para Crédito', choose: '¿Con qué identificación quieres verificarte?',
    ine: 'INE', ineSub: 'Credencial para votar, frente y reverso', passport: 'Pasaporte', passportSub: 'Página con tu foto y datos',
    doc_frente: { ine: 'INE – frente', pasaporte: 'Pasaporte – página de datos' }, doc_reverso: { ine: 'INE – reverso' },
    docHint: 'Coloca el documento dentro del marco, sin reflejos y con buena luz.',
    take: 'Tomar foto', retake: 'Repetir', use: 'Usar foto', upload: 'Subir desde galería',
    live: 'Prueba de vida', liveIntro: 'Ahora mira a la cámara. Te pediremos 3 movimientos para comprobar que eres tú, en vivo.',
    start: 'Comenzar', center: 'Centra tu rostro en el óvalo', hold: 'No te muevas…',
    ch: { turn_left: 'Gira la cabeza a la izquierda', turn_right: 'Gira la cabeza a la derecha', smile: 'Sonríe 😊', blink: 'Parpadea dos veces', look_up: 'Mira hacia arriba' },
    curp: 'Tu CURP', curpHint: '18 caracteres. La encuentras en tu INE o en gob.mx/curp.', send: 'Verificar mi identidad',
    analyzing: 'Analizando…', approved: '¡Identidad verificada!', submitted: 'Recibimos tu identificación', back: 'Regresa a WhatsApp para continuar con tu crédito.',
    openWa: 'Volver a WhatsApp', errors: 'Revisa lo siguiente:', noCam: 'No pudimos usar la cámara. Sube una foto desde tu galería.',
    already: 'Esta verificación ya fue enviada.', next: 'Continuar',
  },
  en: {
    title: 'Identity verification', intro: 'Before your financing application we verify your identity. It takes about 2 minutes.',
    demo: 'Demo mode: verification is simulated.',
    consent: 'I give my express consent to the processing of my official ID and biometric data (face) to verify my identity, as described in the',
    notice: 'Credit Privacy Notice', choose: 'Which ID would you like to use?',
    ine: 'INE', ineSub: 'Mexican voter ID, front and back', passport: 'Passport', passportSub: 'Photo and data page',
    doc_frente: { ine: 'INE – front', pasaporte: 'Passport – data page' }, doc_reverso: { ine: 'INE – back' },
    docHint: 'Place the document inside the frame, with good light and no glare.',
    take: 'Take photo', retake: 'Retake', use: 'Use photo', upload: 'Upload from gallery',
    live: 'Liveness check', liveIntro: 'Now look at the camera. We\'ll ask for 3 movements to confirm it\'s really you, live.',
    start: 'Start', center: 'Center your face in the oval', hold: 'Hold still…',
    ch: { turn_left: 'Turn your head left', turn_right: 'Turn your head right', smile: 'Smile 😊', blink: 'Blink twice', look_up: 'Look up' },
    curp: 'Your CURP', curpHint: '18 characters. It\'s on your INE or at gob.mx/curp.', send: 'Verify my identity',
    analyzing: 'Analyzing…', approved: 'Identity verified!', submitted: 'We received your ID', back: 'Go back to WhatsApp to continue your application.',
    openWa: 'Back to WhatsApp', errors: 'Please check:', noCam: 'We couldn\'t use the camera. Upload a photo from your gallery.',
    already: 'This verification was already submitted.', next: 'Continue',
  },
}[L];

const state = { docType: null, files: {}, stream: null, step: 0 };
const h = (html) => { root.innerHTML = html; };
const $ = (sel) => root.querySelector(sel);
const steps = (n) => `<div class="steps">${[0, 1, 2, 3].map((i) => `<span class="${i <= n ? 'on' : ''}"></span>`).join('')}</div>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function stopCam() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

async function openCam(video, facingMode) {
  stopCam();
  state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
  video.srcObject = state.stream;
  await video.play();
}

function grab(video, mirror = false) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth || 960;
  c.height = video.videoHeight || 1280;
  const ctx = c.getContext('2d');
  if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
}

// --- Paso 1: consentimiento y tipo de documento ------------------------------------------
function stepIntro() {
  if (boot.status !== 'pending') return h(`<h1>🪪 ${T.title}</h1><p>${T.already}</p><a class="btn wa" href="${boot.whatsappUrl}">${T.openWa}</a>`);
  h(`${steps(0)}<h1>🪪 ${T.title}</h1><p>${T.intro}</p>${boot.demo ? `<p class="demo">${T.demo}</p>` : ''}
    <label class="check"><input type="checkbox" id="consent"> <span>${T.consent} <a href="${boot.privacyUrl}" target="_blank">${T.notice}</a>.</span></label>
    <p><b>${T.choose}</b></p>
    <div class="choice">
      <button data-doc="ine" disabled>🇲🇽 ${T.ine}<small>${T.ineSub}</small></button>
      <button data-doc="pasaporte" disabled>🛂 ${T.passport}<small>${T.passportSub}</small></button>
    </div>`);
  $('#consent').onchange = (e) => root.querySelectorAll('[data-doc]').forEach((b) => (b.disabled = !e.target.checked));
  root.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => {
    state.docType = b.dataset.doc;
    state.consent = true;
    captureDoc('doc_frente');
  }));
}

// --- Paso 2: documento -------------------------------------------------------------------
async function captureDoc(side) {
  const label = T[side][state.docType];
  h(`${steps(1)}<h1>${label}</h1><p class="hint">${T.docHint}</p>
    <div class="cam"><video playsinline muted></video><div class="frame"></div></div>
    <div class="row"><button class="btn" id="take">📸 ${T.take}</button>
    <label class="btn ghost">${T.upload}<input type="file" accept="image/*" hidden id="file"></label></div>`);
  const video = $('video');
  const done = async (blob) => {
    stopCam();
    state.files[side] = blob;
    const url = URL.createObjectURL(blob);
    h(`${steps(1)}<h1>${label}</h1><div class="cam"><img src="${url}" alt=""></div>
      <div class="row"><button class="btn" id="ok">✓ ${T.use}</button><button class="btn ghost" id="again">${T.retake}</button></div>`);
    $('#again').onclick = () => captureDoc(side);
    $('#ok').onclick = () => (state.docType === 'ine' && side === 'doc_frente' ? captureDoc('doc_reverso') : liveIntro());
  };
  $('#file').onchange = (e) => e.target.files[0] && done(e.target.files[0]);
  try {
    await openCam(video, 'environment');
    $('#take').onclick = async () => done(await grab(video));
  } catch {
    $('#take').disabled = true;
    root.querySelector('.hint').textContent = T.noCam;
  }
}

// --- Paso 3: prueba de vida --------------------------------------------------------------
function liveIntro() {
  h(`${steps(2)}<h1>🙂 ${T.live}</h1><p>${T.liveIntro}</p>
    <ol>${boot.challenges.map((c) => `<li>${T.ch[c]}</li>`).join('')}</ol>
    <button class="btn" id="go">${T.start}</button>`);
  $('#go').onclick = liveness;
}

async function liveness() {
  h(`${steps(2)}<div class="cam"><video playsinline muted class="mirror"></video><div class="oval"></div><div class="prompt" id="prompt">${T.center}</div><div class="count" id="count"></div></div>
    <div class="thumbs" id="thumbs"></div>`);
  const video = $('video');
  try {
    await openCam(video, 'user');
  } catch {
    // Sin cámara frontal no hay prueba de vida en vivo: se piden fotos de cada reto.
    return livenessFallback();
  }
  const prompt = $('#prompt');
  const count = $('#count');
  const thumb = (blob) => { const i = document.createElement('img'); i.src = URL.createObjectURL(blob); $('#thumbs').append(i); };
  await sleep(1200);
  prompt.textContent = T.hold;
  await sleep(900);
  state.files.selfie = await grab(video, true);
  thumb(state.files.selfie);
  $('.oval').classList.add('ok');
  for (let i = 0; i < boot.challenges.length; i++) {
    $('.oval').classList.remove('ok');
    prompt.textContent = T.ch[boot.challenges[i]];
    for (let n = 3; n > 0; n--) { count.textContent = n; await sleep(800); }
    count.textContent = '';
    state.files[`liveness_${i}`] = await grab(video, true);
    thumb(state.files[`liveness_${i}`]);
    $('.oval').classList.add('ok');
    await sleep(500);
  }
  stopCam();
  stepCurp();
}

function livenessFallback() {
  const keys = ['selfie', ...boot.challenges.map((_, i) => `liveness_${i}`)];
  const labels = [T.center, ...boot.challenges.map((c) => T.ch[c])];
  h(`${steps(2)}<h1>🙂 ${T.live}</h1><p class="hint">${T.noCam}</p>
    ${keys.map((k, i) => `<label>${labels[i]}<input type="file" accept="image/*" capture="user" data-k="${k}"></label>`).join('')}
    <button class="btn" id="next" disabled>${T.next}</button>`);
  root.querySelectorAll('[data-k]').forEach((inp) => (inp.onchange = () => {
    state.files[inp.dataset.k] = inp.files[0];
    $('#next').disabled = !keys.every((k) => state.files[k]);
  }));
  $('#next').onclick = stepCurp;
}

// --- Paso 4: CURP y envío ----------------------------------------------------------------
function stepCurp(errors = []) {
  h(`${steps(3)}<h1>${T.curp}</h1>
    ${errors.length ? `<p class="error">${T.errors} ${errors.map(esc).join(', ')}</p>` : ''}
    <label>${T.curp}<input id="curp" maxlength="18" autocapitalize="characters" autocomplete="off" placeholder="XXXX000000XXXXXX00" value="${esc(state.curp || '')}"></label>
    <p class="hint">${T.curpHint}</p>
    <button class="btn" id="send">${T.send}</button>`);
  $('#send').onclick = submit;
}

async function submit() {
  state.curp = $('#curp').value.trim().toUpperCase();
  const form = new FormData();
  form.append('doc_type', state.docType);
  form.append('curp', state.curp);
  form.append('consent', '1');
  form.append('challenge_token', boot.challengeToken);
  for (const [k, blob] of Object.entries(state.files)) form.append(k, blob, `${k}.jpg`);

  const checks = [];
  h(`<h1 id="ktitle">🔎 ${T.analyzing}</h1><ul class="checks" id="checks"></ul>`);
  let res;
  try {
    res = await fetch(location.pathname, { method: 'POST', body: form });
  } catch {
    return stepCurp(['network']);
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 422) return stepCurp(json.errors || []);
  if (!res.ok) return h(`<p class="error">${esc(json.error || res.status)}</p>`);

  // Muestra el resultado del análisis paso a paso.
  for (const c of json.analysis?.checks || checks) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(c.label[L])}</span><b>${c.ok ? '✓' : '✗'}${c.score ? ` ${(c.score * 100).toFixed(1)}%` : ''}</b>`;
    $('#checks').append(li);
    await sleep(450);
    li.classList.add('done');
  }
  await sleep(400);
  const ok = json.status === 'approved';
  $('#ktitle').textContent = ok ? `✅ ${T.approved}` : `📨 ${T.submitted}`;
  root.insertAdjacentHTML('beforeend', `<p>${T.back}</p>
    ${json.analysis?.disclaimer ? `<p class="demo">${esc(json.analysis.disclaimer)}</p>` : ''}
    <a class="btn wa" href="${boot.whatsappUrl}">${T.openWa}</a>`);
}

stepIntro();
