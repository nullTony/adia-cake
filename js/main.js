/**
 * main.js
 * Entry point — imports and initialises all modules.
 * Loaded as <script type="module"> in index.html.
 */

import { initMenu }                   from './modules/menu.js';
import { initMobileMenu }             from './modules/mobile-menu.js';
import { initCart }                   from './modules/cart.js';
import { initFavorites }              from './modules/favorites.js';
import { initBranches }               from './modules/branches.js';
import { initCheckout }               from './modules/checkout.js';
import { initScrollReveal }           from './modules/scroll-reveal.js';
import { initDateLabel }              from './utils/date.js';
import { initProfileMenu }            from './modules/profile-menu.js';
import { initAuth }                   from './services/auth-service.js';
import { initStorefront }             from './modules/storefront.js';
import { initQuickView }              from './modules/quick-view.js';
import { initBranchSelector }         from './modules/branch-selector.js';
import { initClientNotifications, stopNotifications } from './services/notification-service.js';
import { initNotifications, stopToastNotifications }  from './notifications.js';
import { initTesCarousel }                            from './modules/tes-carousel.js';
import { getBranches }                                from './api/branches-api.js';
import { initBenefitsCounter }                        from './modules/benefits-counter.js';
import { initCategoriesShowcase }                     from './modules/categories-showcase.js';

document.addEventListener('DOMContentLoaded', () => {
  initMenu();
  initMobileMenu();
  initProfileMenu();
  initAuth();
  initQuickView();
  initCart();
  initFavorites();
  initCheckout();
  initBranches();

  getBranches().then(branches => {
    const active = branches.filter(b => b.is_active !== false);
    const count = active.length || branches.length;

    const heroEl = document.getElementById('heroBranchCount');
    if (heroEl && count) heroEl.textContent = count;

    const benefitEl = document.getElementById('branchesCount');
    if (benefitEl && count) benefitEl.textContent = count + ' филиала';
  });
  initScrollReveal();
  initBenefitsCounter();
  initDateLabel();

  // Branch selector validates stored branch + shows modal if needed.
  // initStorefront reacts to adia:branch-change so order doesn't matter.
  initBranchSelector();
  initCategoriesShowcase();
  initStorefront();
  initTesCarousel();

  // Start client notifications after auth resolves
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
