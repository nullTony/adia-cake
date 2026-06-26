// ================================
//  MOBILE BOTTOM NAVIGATION
//  Delegates to existing header buttons (cart, fav).
//  "Мои заказы" opens the orders panel directly.
//  Mirrors cart/fav badges via MutationObserver.
// ================================

import { openMyOrders } from './my-orders.js';

function _syncBadge(sourceId, targetId) {
  const source = document.getElementById(sourceId);
  const target = document.getElementById(targetId);
  if (!source || !target) return;

  const update = () => {
    target.textContent = source.textContent;
    target.classList.toggle('hidden', source.classList.contains('hidden'));
  };

  update();
  new MutationObserver(update).observe(source, {
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });
}

export function initMobileNav() {
  document.getElementById('mnFav')?.addEventListener('click', () => {
    document.getElementById('favBtn')?.click();
  });

  document.getElementById('mnOrders')?.addEventListener('click', () => {
    openMyOrders();
  });

  document.getElementById('mnCart')?.addEventListener('click', () => {
    document.getElementById('cartBtn')?.click();
  });

  _syncBadge('cartCount', 'mnCartBadge');
  _syncBadge('favCount',  'mnFavBadge');
}
