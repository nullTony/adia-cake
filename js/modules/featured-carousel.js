// ================================
//  FEATURED CAROUSEL
//  Controls appear ONLY when cards overflow the visible width.
//  Left arrow hidden at scroll start, right arrow hidden at scroll end.
//  Cards centered when no overflow.
// ================================

export function initFeatCarousel(grid) {
  if (!grid) return;

  // Remove controls injected by a previous call (branch change, etc.)
  grid.parentElement?.querySelectorAll('.fc-controls').forEach(el => el.remove());

  const cards = Array.from(grid.querySelectorAll('.product-card'));
  if (cards.length < 2) return;

  // ── Inject arrow controls ─────────────────────────────────────────────────

  const controls = document.createElement('div');
  controls.className = 'fc-controls';
  controls.style.display = 'none'; // hidden until overflow confirmed
  controls.innerHTML =
    `<button type="button" class="fc-arrow fc-arrow--prev" aria-label="Предыдущий">←</button>` +
    `<button type="button" class="fc-arrow fc-arrow--next" aria-label="Следующий">→</button>`;

  grid.after(controls);

  const prevBtn = controls.querySelector('.fc-arrow--prev');
  const nextBtn = controls.querySelector('.fc-arrow--next');

  // ── Scroll step = one card width + gap ────────────────────────────────────

  function _stepWidth() {
    const card = cards[0];
    if (!card) return 256;
    const gap = parseFloat(getComputedStyle(grid).gap) || 16;
    return card.offsetWidth + gap;
  }

  prevBtn.addEventListener('click', () => {
    grid.scrollBy({ left: -_stepWidth(), behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    grid.scrollBy({ left: _stepWidth(), behavior: 'smooth' });
  });

  // ── Arrow visibility based on scroll position ─────────────────────────────

  function _updateArrows() {
    const atStart = grid.scrollLeft <= 2;
    const atEnd   = grid.scrollLeft >= grid.scrollWidth - grid.clientWidth - 2;
    prevBtn.hidden = atStart;
    nextBtn.hidden = atEnd;
  }

  grid.addEventListener('scroll', _updateArrows, { passive: true });

  // ── Show controls only when overflow; center cards otherwise ──────────────

  function _updateLayout() {
    const overflows = grid.scrollWidth > grid.clientWidth + 2;

    // Show/hide the whole controls block
    controls.style.display = overflows ? 'flex' : 'none';

    // When cards don't fill the row — center them instead of left-aligning
    grid.classList.toggle('feat-grid--centered', !overflows);

    if (overflows) _updateArrows();
  }

  // Double rAF: first waits for DOM paint, second for layout recalc
  requestAnimationFrame(() => requestAnimationFrame(_updateLayout));

  // Re-check when container width changes (window resize, sidebar, etc.)
  const ro = new ResizeObserver(_updateLayout);
  ro.observe(grid);
}
