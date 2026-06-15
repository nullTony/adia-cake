// ================================
//  TESTIMONIALS CAROUSEL (mobile only ≤768px)
//  CSS scroll-snap handles swipe & snap.
//  This module adds: dots indicator + auto-advance + touch pause.
// ================================

export function initTesCarousel() {
  if (window.innerWidth > 768) return;

  const grid  = document.querySelector('.tes-grid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.tes-card'));
  if (cards.length < 2) return;

  // ── Dots ─────────────────────────────────────────────────────────────────────

  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'tc-dots';
  dotsWrap.innerHTML = cards.map((_, i) =>
    `<span class="tc-dot${i === 0 ? ' active' : ''}"></span>`
  ).join('');
  grid.after(dotsWrap);
  dotsWrap.classList.add('visible');

  const dots = dotsWrap.querySelectorAll('.tc-dot');
  let current = 0;

  function _setActive(idx) {
    current = Math.max(0, Math.min(idx, cards.length - 1));
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function _goTo(idx) {
    _setActive(idx);
    grid.scrollTo({ left: cards[current].offsetLeft, behavior: 'smooth' });
  }

  // ── Auto-advance ──────────────────────────────────────────────────────────────

  let _timer = null;

  function _start() {
    clearInterval(_timer);
    _timer = setInterval(() => {
      _goTo(current >= cards.length - 1 ? 0 : current + 1);
    }, 5000);
  }

  function _pause() { clearInterval(_timer); }

  function _resume() {
    // Small delay after touch-end so snap finishes first
    setTimeout(_start, 1200);
  }

  // ── Sync dots on user scroll ──────────────────────────────────────────────────

  grid.addEventListener('scroll', () => {
    const w   = grid.offsetWidth;
    if (!w) return;
    const idx = Math.round(grid.scrollLeft / w);
    if (idx !== current) _setActive(idx);
  }, { passive: true });

  // ── Touch: pause auto-advance while user interacts ────────────────────────────

  grid.addEventListener('touchstart', _pause,  { passive: true });
  grid.addEventListener('touchend',   _resume, { passive: true });

  _start();
}
