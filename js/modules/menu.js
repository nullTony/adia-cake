/**
 * menu.js
 * Sticky header shadow on scroll.
 * Burger / mobile menu is handled by mobile-menu.js.
 */

export function initMenu() {
  const header = document.getElementById('hdr');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.style.boxShadow = window.scrollY > 8
      ? '0 4px 24px rgba(44,24,16,.09)'
      : 'none';
  }, { passive: true });
}
