// ================================
//  FEATURED CAROUSEL
//  Controls appear only when cards overflow the visible width.
//  ResizeObserver keeps visibility in sync on window resize.
// ================================

export function initFeatCarousel(grid) {
  if (!grid) return;

  // Remove controls from a previous call (e.g. branch change)
  grid.parentElement?.querySelectorAll('.fc-controls').forEach(el => el.remove());

  const cards = Array.from(grid.querySelectorAll('.product-card'));
  if (cards.length < 2) return;

  // ── Inject controls ───────────────────────────────────────────────────────

  const controls = document.createElement('div');
  controls.className = 'fc-controls';
  controls.innerHTML =
    `<button type="button" class="fc-arrow fc-arrow--prev" aria-label="Предыдущий">←</button>` +
    `<div class="fc-dots">` +
      cards.map((_, i) => `<span class="fc-dot${i === 0 ? ' active' : ''}"></span>`).join('') +
    `</div>` +
    `<button type="button" class="fc-arrow fc-arrow--next" aria-label="Следующий">→</button>`;

  grid.after(controls);

  const dots    = controls.querySelectorAll('.fc-dot');
  const prevBtn = controls.querySelector('.fc-arrow--prev');
  const nextBtn = controls.querySelector('.fc-arrow--next');

  let currentIdx = 0;

  function _setActive(idx) {
    currentIdx = Math.max(0, Math.min(idx, cards.length - 1));
    dots.forEach((d, i) => d.classList.toggle('active', i === currentIdx));
    prevBtn.disabled = currentIdx === 0;
    nextBtn.disabled = currentIdx === cards.length - 1;
  }

  function _goTo(idx) {
    _setActive(idx);
    grid.scrollTo({
      left: cards[currentIdx].offsetLeft - grid.offsetLeft,
      behavior: 'smooth',
    });
  }

  prevBtn.addEventListener('click', () => _goTo(currentIdx - 1));
  nextBtn.addEventListener('click', () => _goTo(currentIdx + 1));

  // ── Sync dots while user swipes ───────────────────────────────────────────

  grid.addEventListener('scroll', () => {
    const gridLeft = grid.getBoundingClientRect().left;
    let closest = 0;
    let minDist  = Infinity;
    cards.forEach((card, i) => {
      const dist = Math.abs(card.getBoundingClientRect().left - gridLeft);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    if (closest !== currentIdx) _setActive(closest);
  }, { passive: true });

  // ── Show controls only when cards actually overflow ───────────────────────

  function _updateVisibility() {
    // +2px tolerance for sub-pixel rounding
    controls.hidden = grid.scrollWidth <= grid.clientWidth + 2;
  }

  // Two rAFs: first waits for DOM paint, second waits for layout recalc
  requestAnimationFrame(() => requestAnimationFrame(_updateVisibility));

  // Re-check when container resizes (handles window resize + branch change)
  const ro = new ResizeObserver(_updateVisibility);
  ro.observe(grid);

  _setActive(0);
}
