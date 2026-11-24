/* Motor de la presentación.
   Cada diapositiva corre sola una animación de ~30 s (atributos data-at="segundo") y luego se queda quieta.
   Avanzar (→, espacio, clicker) adelanta al siguiente momento de la animación; si ya terminó, pasa de diapositiva.
   Modos por URL: ?presenter (notas + reloj), ?mirror (sigue a la principal), ?static=N (diapositiva N completa). */
(function () {
  var Q = new URLSearchParams(location.search);
  var MODE = Q.has('presenter') ? 'presenter' : Q.has('mirror') ? 'mirror' : Q.has('static') ? 'static' : 'main';
  var stage = document.getElementById('stage');
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  var N = slides.length;
  var cur = -1, t0 = 0, built = false, raf = 0;
  // ?solo = ventana independiente (p. ej. la animación de los agentes en otra pantalla): no controla ni sigue a la principal
  var chan = 'BroadcastChannel' in window && !Q.has('solo') ? new BroadcastChannel('ponencia-vamo-mesa') : null;
  if (Q.has('clean') || MODE !== 'main') document.body.classList.add('clean');

  /* --- Escalado del escenario --- */
  function fit() {
    var s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  addEventListener('resize', fit); fit();

  /* --- Zona segura: todo el contenido (menos notas y fuente) va en .fit > .inner.
     Si al medir no cabe, se reduce proporcionalmente; nunca se sale de la pantalla. --- */
  slides.forEach(function (sl) {
    var fitBox = document.createElement('div'); fitBox.className = 'fit';
    var inner = document.createElement('div'); inner.className = 'inner';
    fitBox.appendChild(inner);
    [].slice.call(sl.children).forEach(function (c) {
      if (c.matches('.notes, .src')) return;
      inner.appendChild(c);
    });
    sl.insertBefore(fitBox, sl.firstChild);
    // Logos de esquina: en el mismo renglón que el "kicker", nunca encima del texto
    var cl = inner.querySelector(':scope > .corner-logos');
    if (cl) {
      var head = document.createElement('div'); head.className = 'headrow';
      var k = cl.nextElementSibling && cl.nextElementSibling.matches('.kicker') ? cl.nextElementSibling : null;
      inner.insertBefore(head, cl);
      if (k) head.appendChild(k);
      head.appendChild(cl);
    }
  });
  function fitSlide(sl) {
    var box = sl.querySelector('.fit'), inner = sl.querySelector('.inner');
    inner.style.transform = ''; inner.style.width = ''; inner.style.minHeight = '';
    sl.classList.add('measuring');
    // Se mide el layout real (offsets), no scrollWidth/scrollHeight: esos incluyen los
    // desplazamientos de las animaciones de entrada y harían reducir la diapositiva sin necesidad.
    var k = 1;
    for (var n = 0; n < 4; n++) {
      var W = box.clientWidth / k, H = box.clientHeight / k;
      var need = Math.max(contentBottom(inner) / H, maxRight(inner) / W);
      if (!isFinite(need) || need <= 1.001) break;
      k = k / need * 0.985;
      inner.style.transform = 'scale(' + k + ')';
      inner.style.width = (100 / k) + '%';
      inner.style.minHeight = (100 / k) + '%';
    }
    sl.classList.remove('measuring');
    sl.dataset.fit = k.toFixed(3);
  }
  function contentBottom(inner) {
    var b = 0;
    [].slice.call(inner.children).forEach(function (c) { b = Math.max(b, c.offsetTop + c.offsetHeight); });
    return b;
  }
  // Ancho real usado (detecta títulos o cifras que se desbordan hacia la derecha)
  function maxRight(inner) {
    var r = 0;
    inner.querySelectorAll('.h, .big, .t, .chip, .card, .logos, .meme, .qr, .grid, .stairs, .call').forEach(function (e) {
      var x = 0, n = e;
      while (n && n !== inner && n !== document.body) { x += n.offsetLeft; n = n.offsetParent; }
      if (n === inner) r = Math.max(r, x + Math.max(e.offsetWidth, e.scrollWidth));
    });
    return r;
  }
  function fitAll() { slides.forEach(fitSlide); }
  fitAll();
  if (document.fonts) document.fonts.ready.then(fitAll);
  addEventListener('load', fitAll);

  /* --- Línea de tiempo de una diapositiva --- */
  function times(sl) {
    var t = [];
    sl.querySelectorAll('[data-at]').forEach(function (e) { t.push(+e.dataset.at); });
    sl.querySelectorAll('[data-cue]').forEach(function (e) {
      e.dataset.cue.split(',').forEach(function (c) { t.push(+c.split(':')[0]); });
    });
    return t.sort(function (a, b) { return a - b; });
  }
  function duration(sl) { var t = times(sl); return +(sl.dataset.dur || (t.length ? t[t.length - 1] + 1 : 0)); }
  var manualT = 0;
  function isManual() { return slides[cur] && slides[cur].hasAttribute('data-manual'); }
  function elapsed() { return built ? 1e9 : isManual() ? manualT : (performance.now() - t0) / 1000; }

  function reset(sl) {
    sl.querySelectorAll('[data-at]').forEach(function (e) { e.classList.remove('on'); e._done = false; });
    sl.querySelectorAll('[data-cue]').forEach(function (e) {
      e.dataset.cue.split(',').forEach(function (c) { e.classList.remove(c.split(':')[1]); });
      e._cues = {};
    });
        sl.querySelectorAll('[data-type]').forEach(function (e) { e._typeAt = undefined; e.classList.remove('caret'); });
    sl.querySelectorAll('[data-timer]').forEach(function (e) { clearInterval(e._iv); e.textContent = fmt(+e.dataset.timer); e.classList.remove('low'); });
  }

  function tick() {
    var sl = slides[cur]; if (!sl) return;
    var el = elapsed();
    sl.querySelectorAll('[data-at]').forEach(function (e) {
      if (!e._done && +e.dataset.at <= el) { e._done = true; e.classList.add('on'); act(e, built); }
    });
    sl.querySelectorAll('[data-cue]').forEach(function (e) {
      e.dataset.cue.split(',').forEach(function (c) {
        var p = c.split(':');
        if (!e._cues[p[0] + p[1]] && +p[0] <= el) { e._cues[p[0] + p[1]] = 1; e.classList.add(p[1]); }
      });
    });
    var d = duration(sl), bar = document.getElementById('tl');
    if (bar) { var f = d ? Math.min(1, el / d) : 1; bar.style.width = (f * 100) + '%'; bar.classList.toggle('done', f >= 1); }
    if (MODE === 'main' && chan) chan.postMessage({ i: cur, el: built ? -1 : el, dur: d });
    if (!built) {
      sl.querySelectorAll('[data-type]').forEach(function (e) {
        if (e._typeAt === undefined || !e.classList.contains('caret')) return;
        var n = Math.floor((el - e._typeAt) * 1000 / +(e.dataset.type || 28));
        if (n >= e._full.length) { e.textContent = e._full; e.classList.remove('caret'); }
        else if (n > 0) e.textContent = e._full.slice(0, n);
      });
    }
    sl.querySelectorAll('[data-stopwatch]').forEach(function (e) {
      var at = +e.closest('[data-at]').dataset.at, end = +e.dataset.stopwatch;
      e.textContent = fmt2(built ? end : Math.max(0, Math.min(end, Math.floor(el - at))));
    });
    raf = requestAnimationFrame(tick);
  }

  /* Acciones especiales al aparecer: contadores, máquina de escribir, cronómetro */
  function act(e, instant) {
    if (e.dataset.count) {
      var to = +e.dataset.count, dec = +(e.dataset.dec || 0), ms = instant ? 0 : +(e.dataset.cdur || 2.4) * 1000, st = performance.now();
      var pre = e.dataset.pre || '', suf = e.dataset.suf || '';
      (function step() {
        var k = ms ? Math.min(1, (performance.now() - st) / ms) : 1;
        var v = to * (1 - Math.pow(1 - k, 3));
        e.textContent = pre + v.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
        if (k < 1) requestAnimationFrame(step);
      })();
    }
    if (e.dataset.type !== undefined) {
      // Máquina de escribir: la avanza tick() según el tiempo de la diapositiva (sigue al clicker)
      e._full = e._full || e.textContent;
      e.textContent = instant ? e._full : '';
      e._typeAt = +e.closest('[data-at]').dataset.at;
      e.classList.toggle('caret', !instant);
    }
    if (e.dataset.timer) {
      var left = +e.dataset.timer; e.textContent = fmt(left);
      if (instant) return;
      clearInterval(e._iv);
      e._iv = setInterval(function () {
        left--; e.textContent = fmt(Math.max(0, left));
        e.classList.toggle('low', left <= 30);
        if (left <= 0) clearInterval(e._iv);
      }, 1000);
    }
  }
  function fmt(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function fmt2(s) { return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }

  function go(i, opts) {
    i = Math.max(0, Math.min(N - 1, i));
    opts = opts || {};
    if (slides[cur]) { slides[cur].classList.remove('active'); stopVideos(slides[cur]); }
    cur = i; built = !!opts.built; manualT = opts.at || 0;
    var sl = slides[cur];
    reset(sl);
    fitSlide(sl);
    sl.classList.add('active');
    startVideos(sl);
    t0 = performance.now() - (opts.at || 0) * 1000;
    if (MODE === 'main') history.replaceState(null, '', location.pathname + location.search + '#' + (cur + 1));
    cancelAnimationFrame(raf); tick();
  }
  /* --- Videos de YouTube: solo suenan en la ventana principal; en presentador/vista previa, miniatura --- */
  function ytPlaceholder(box, msg) {
    box.innerHTML = '<div class="ph"><span><b>▶</b>' + msg + '</span></div>';
    box.style.backgroundImage = 'url(assets/fotos/yt-' + box.dataset.yt + '.jpg)';
  }
  function startVideos(sl) {
    sl.querySelectorAll('.yt[data-yt]').forEach(function (box) {
      if (MODE !== 'main') return ytPlaceholder(box, 'El video se reproduce en la pantalla principal');
      if (!navigator.onLine) return ytPlaceholder(box, 'Sin internet: youtube.com/shorts/' + box.dataset.yt);
      box.innerHTML = '';
      var f = document.createElement('iframe');
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.title = 'Video de YouTube';
      f.src = 'https://www.youtube.com/embed/' + box.dataset.yt + '?autoplay=1&playsinline=1&rel=0&modestbranding=1';
      box.appendChild(f);
    });
  }
  function stopVideos(sl) {
    sl.querySelectorAll('.yt[data-yt]').forEach(function (box) { box.innerHTML = ''; });
  }
  // Si se hace clic dentro del video, el foco se regresa a la presentación para que el clicker siga funcionando
  addEventListener('blur', function () {
    if (MODE === 'main') setTimeout(function () { if (document.activeElement && document.activeElement.tagName === 'IFRAME') { document.activeElement.blur(); focus(); } }, 300);
  });

  /* --- Video de espera en loop: aparece al abrir en la diapositiva 1; el primer avance lo quita --- */
  var introEl = document.getElementById('intro'), introVid = introEl && introEl.querySelector('video');
  function showIntro() { if (!introVid) return; document.body.classList.add('intro'); introVid.currentTime = 0; var p = introVid.play(); if (p && p.catch) p.catch(function () {}); }
  if (introEl) introEl.addEventListener('click', function () { next(); });
  // video → (clic) → lámina 0 con QR de asistencia y contador → (clic) → portada
  function hideIntro() { document.body.classList.remove('intro'); setTimeout(function () { if (introVid) introVid.pause(); }, 900); if (window.Asis0) Asis0.show(); else go(0); }
  document.addEventListener('asis0-next', function () { next(); });
  function next() {
    if (document.body.classList.contains('intro')) { hideIntro(); return; }
    if (window.Asis0 && Asis0.active()) { Asis0.hide(); go(0); return; }
    var el = elapsed(), up = times(slides[cur]).filter(function (t) { return t > el + .05; });
    if (up.length) { manualT = up[0]; t0 = performance.now() - up[0] * 1000; return; }
    if (cur < N - 1) go(cur + 1);
  }
  function prev() { if (window.Asis0 && Asis0.active()) return; if (cur > 0) go(cur - 1, { built: true }); else if (MODE === 'main' && window.Asis0) Asis0.show(); }

  /* --- Memes: si existe el GIF en assets/memes/, se usa; si no, queda la animación propia --- */
  document.querySelectorAll('.meme[data-gif]').forEach(function (m) {
    var img = new Image();
    img.onload = function () { m.insertBefore(img, m.firstChild); m.classList.add('has-gif'); };
    img.alt = ''; img.src = m.dataset.gif;
  });

  /* --- Modo presentador --- */
  if (MODE === 'presenter') return presenter();

  if (MODE === 'static') { document.body.classList.add('nofx'); go((+Q.get('static') || 1) - 1, { built: true }); return; }
  if (MODE === 'mirror') {
    go(0, { built: true });
    if (chan) chan.onmessage = function (m) {
      var d = m.data; if (d.cmd) return;
      if (d.i !== cur) go(d.i, d.el < 0 ? { built: true } : { at: d.el });
      else if (d.el >= 0 && Math.abs(elapsed() - d.el) > .5) { manualT = d.el; t0 = performance.now() - d.el * 1000; }
    };
    return;
  }

  go((parseInt(location.hash.slice(1), 10) || 1) - 1);
  if (cur === 0 && !Q.has('nointro')) showIntro();
  if (chan) chan.onmessage = function (m) {
    var d = m.data;
    if (d.cmd === 'next') next(); else if (d.cmd === 'prev') prev();
    else if (d.cmd === 'go') go(d.i); else if (d.cmd === 'replay') go(cur);
    else if (d.cmd === 'black') document.body.classList.toggle('black');
  };

  var typed = '';
  addEventListener('keydown', function (e) {
    var k = e.key;
    if (/^[0-9]$/.test(k)) { typed += k; return; }
    if (k === 'Enter' && typed) { go(+typed - 1); typed = ''; return; }
    typed = '';
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].indexOf(k) >= 0) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].indexOf(k) >= 0) { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(N - 1);
    else if (k === 'b' || k === '.') document.body.classList.toggle('black');
    else if (k === 'i') { if (document.body.classList.contains('intro')) hideIntro(); else { if (window.Asis0) Asis0.hide(); showIntro(); } }
    else if (k === 'q') { if (window.Asis0) { if (Asis0.active()) Asis0.hide(); else Asis0.show(); } }
    else if (k === 'r') go(cur);
    else if (k === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
    else if (k === 'p') open(location.pathname + '?presenter', 'presentador', 'width=1400,height=860');
    else if (k === 'h' || k === '?') document.body.classList.toggle('help');
    else if (k === 'c') document.body.classList.toggle('clean');
  });
  stage.addEventListener('click', function (e) { if (!e.target.closest('a')) next(); });
  var mt; addEventListener('mousemove', function () {
    document.body.classList.add('show-cursor'); clearTimeout(mt);
    mt = setTimeout(function () { document.body.classList.remove('show-cursor'); }, 1500);
  });

  function presenter() {
    document.title = 'Presentador · ' + document.title;
    document.getElementById('viewport').remove();
    var base = location.pathname;
    var P = document.getElementById('presenter');
    P.hidden = false;
    var $ = function (id) { return document.getElementById(id); };
    $('p-cur').src = base + '?mirror';
    var start = 0, last = { i: 0, el: 0, dur: 0 }, nextShown = -1;
    $('p-start').onclick = function () { start = Date.now(); this.textContent = 'Reiniciar reloj'; };
    $('p-next').onclick = function () { chan.postMessage({ cmd: 'next' }); };
    $('p-prev').onclick = function () { chan.postMessage({ cmd: 'prev' }); };
    $('p-replay').onclick = function () { chan.postMessage({ cmd: 'replay' }); };
    $('p-black').onclick = function () { chan.postMessage({ cmd: 'black' }); };
    addEventListener('keydown', function (e) {
      if (['ArrowRight', 'PageDown', ' '].indexOf(e.key) >= 0) { e.preventDefault(); chan.postMessage({ cmd: 'next' }); }
      if (['ArrowLeft', 'PageUp'].indexOf(e.key) >= 0) { e.preventDefault(); chan.postMessage({ cmd: 'prev' }); }
      if (e.key === 'b') chan.postMessage({ cmd: 'black' });
    });
    function render() {
      var sl = slides[last.i];
      $('p-num').textContent = (last.i + 1) + ' / ' + N;
      $('p-title').textContent = sl.dataset.title || '';
      $('p-notes').innerHTML = (sl.querySelector('.notes') || { innerHTML: '' }).innerHTML;
      var nx = slides[last.i + 1];
      $('p-nexttitle').textContent = nx ? 'Sigue: ' + (last.i + 2) + ' · ' + (nx.dataset.title || '') : 'Fin';
      if (nextShown !== last.i + 1 && nx) { nextShown = last.i + 1; $('p-nextframe').src = base + '?static=' + (last.i + 2); }
      $('p-plan').textContent = sl.dataset.plan ? 'Plan: min ' + Math.floor(+sl.dataset.plan) + ':' + ('0' + Math.round((+sl.dataset.plan % 1) * 60)).slice(-2) : '';
    }
    var shownI = -1;
    if (chan) chan.onmessage = function (m) {
      if (m.data.cmd) return;
      last = m.data;
      if (last.i !== shownI) { shownI = last.i; render(); }
      var f = last.el < 0 || !last.dur ? 1 : Math.min(1, last.el / last.dur);
      $('p-anim').style.width = (f * 100) + '%';
      $('p-animtxt').textContent = f >= 1 ? 'Animación terminada: es tu turno de hablar' : 'Animando… ' + Math.ceil(last.dur - last.el) + ' s';
    };
    setInterval(function () {
      var d = new Date();
      $('p-clock').textContent = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      if (start) {
        var s = Math.floor((Date.now() - start) / 1000);
        $('p-total').textContent = fmt(s);
        var plan = +(slides[last.i].dataset.plan || 0);
        var diff = Math.round(s / 60 - plan);
        $('p-total').style.color = diff > 2 ? '#e23d48' : diff > 0 ? '#f0a830' : '#2bb39a';
      }
    }, 500);
    render();
  }
})();
