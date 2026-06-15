/**
 * scroll-reveal.js
 * Triggers entrance animations on elements with class .anim
 * when they enter the viewport.
 */

export function initScrollReveal() {
  const elements = document.querySelectorAll('.anim');
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(
            () => entry.target.classList.add('visible'),
            i * 70
          );
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  elements.forEach((el) => observer.observe(el));
}
