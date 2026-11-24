// Landing de Vamo Mesa: desplazamiento suave y controles del video del hero.
document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

// Video del hero: arranca silenciado (requisito de autoplay). "Activar sonido" lo reinicia desde el
// principio con audio; si el visitante sale del hero con sonido, se pausa para no hablar en otra sección.
const vid = document.getElementById('heroVid');
const soundBtn = document.getElementById('vidSound');
const playBtn = document.getElementById('vidPlay');
if (vid && soundBtn && playBtn) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setPlayIcon = () => {
    playBtn.textContent = vid.paused ? 'Reproducir' : 'Pausa';
  };
  if (reduce) vid.pause();
  vid.addEventListener('play', setPlayIcon);
  vid.addEventListener('pause', setPlayIcon);
  setPlayIcon();
  soundBtn.addEventListener('click', () => {
    const on = vid.muted;
    vid.muted = !on;
    if (on) { vid.currentTime = 0; vid.play().catch(() => {}); }
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.textContent = on ? 'Silenciar' : 'Activar sonido';
  });
  playBtn.addEventListener('click', () => (vid.paused ? vid.play().catch(() => {}) : vid.pause()));
  let pausedByScroll = false;
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && !vid.paused && !vid.muted) { vid.pause(); pausedByScroll = true; }
    else if (e.isIntersecting && pausedByScroll) { vid.play().catch(() => {}); pausedByScroll = false; }
  }, { threshold: 0.25 }).observe(vid);
}
