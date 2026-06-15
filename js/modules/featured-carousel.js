// ================================
//  FEATURED CAROUSEL (mobile only)
//  Called after _renderFeatured() populates .feat-grid.
//  On desktop (> 768px) this is a no-op.
// ================================

export function initFeatCarousel(grid) {
  if (!grid) return;

  // Remove any controls injected by a previous call (e.g. on branch change)
  grid.parentElement?.querySelectorAll('.fc-controls').forEach(el => el.remove());

  if (window.innerWidth > 768) return; // grid layout handles desktop

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

  const dots     = controls.querySelectorAll('.fc-dot');
  const prevBtn  = controls.querySelector('.fc-arrow--prev');
  const nextBtn  = controls.querySelector('.fc-arrow--next');

  let currentIdx = 0;

  function _setActive(idx) {
    currentIdx = Math.max(0, Math.min(idx, cards.length - 1));
    dots.forEach((d, i) => d.classList.toggle('active', i === currentIdx));
    prevBtn.disabled = currentIdx === 0;
    nextBtn.disabled = currentIdx === cards.length - 1;
  }

  function _goTo(idx) {
    _setActive(idx);
    // Scroll grid so the target card's left edge aligns with the grid's left edge
    grid.scrollTo({
      left: cards[currentIdx].offsetLeft - grid.offsetLeft,
      behavior: 'smooth',
    });
  }

  prevBtn.addEventListener('click', () => _goTo(currentIdx - 1));
  nextBtn.addEventListener('click', () => _goTo(currentIdx + 1));

  // ── Sync dots while user swipes ───────────────────────────────────────────

  grid.addEventListener('scroll', () => {
    // Find which card is most visible
    const gridLeft = grid.getBoundingClientRect().left;
    let closest = 0;
    let minDist  = Infinity;
    cards.forEach((card, i) => {
      const dist = Math.abs(card.getBoundingClientRect().left - gridLeft);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    if (closest !== currentIdx) _setActive(closest);
  }, { passive: true });

  _setActive(0); // initialise button states
}
