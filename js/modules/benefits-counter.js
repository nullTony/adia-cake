/**
 * benefits-counter.js
 * Animates the "100%" counter in the benefits section when it enters the viewport.
 * Uses ease-out timing: fast start, slow finish over ~1500ms.
 */

const DURATION_MS = 1500;
const TARGET      = 100;

export function initBenefitsCounter() {
  const el = document.getElementById('benefitsCounter');
  if (!el) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        _animate(el);
      });
    },
    { threshold: 0.4 }
  );

  observer.observe(el);
}

function _animate(el) {
  const start = performance.now();

  function _tick(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / DURATION_MS, 1);
    // ease-out cubic: decelerates toward the end
    const eased    = 1 - Math.pow(1 - progress, 3);
    const value    = Math.round(eased * TARGET);

    el.textContent = `${value}%`;

    if (progress < 1) requestAnimationFrame(_tick);
  }

  requestAnimationFrame(_tick);
}
