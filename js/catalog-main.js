/**
 * catalog-main.js
 * Entry point for catalog.html — same modules as main.js plus catalog filter.
 */

import { initMenu }             from './modules/menu.js';
import { initMobileMenu }       from './modules/mobile-menu.js';
import { initCart }             from './modules/cart.js';
import { initFavorites }        from './modules/favorites.js';
import { initScrollReveal }     from './modules/scroll-reveal.js';
import { initCatalog }          from './modules/catalog.js';
import { initProfileMenu }      from './modules/profile-menu.js';
import { initAuth }             from './services/auth-service.js';
import { initCheckout }         from './modules/checkout.js';
import { initQuickView }        from './modules/quick-view.js';
import { initBranchSelector }   from './modules/branch-selector.js';
import { initMobileNav }             from './modules/mobile-nav.js';
import { initClientNotifications, stopNotifications } from './services/notification-service.js';
import { initNotifications, stopToastNotifications }  from './notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  initMenu();
  initMobileMenu();
  initProfileMenu();
  initAuth();
  initQuickView();
  initCart();
  initFavorites();
  initCheckout();
  initScrollReveal();
  initMobileNav();

  // Branch selector validates stored branch + shows modal if needed.
  // initCatalog reacts to adia:branch-change so order doesn't matter.
  initBranchSelector();
  initCatalog();

  window.addEventListener('adia:auth-change', e => {
    stopNotifications();
    stopToastNotifications();
    const user = e.detail?.user;
    if (user?.type === 'client') {
      initClientNotifications(user.id);
      initNotifications();
    }
  }, { once: false });
});
