// ================================
//  PRODUCT CARD RENDERER
//
//  Shared between storefront (homepage) and catalog page.
//  Produces HTML compatible with cart.js and favorites.js:
//    data-product-id, data-category, data-price
//    .pc-name, .pc-price > text + <span>сум</span>
//    .pc-ph img, .pc-fav, .pc-add
// ================================


import { formatWeight } from '../utils/weight.js';
import { esc }         from '../utils/format.js';

export const CATEGORIES = {
  cakes:       'Торты',
  desserts:    'Десерты',
  pastry:      'Выпечка',
  cheesecakes: 'Чизкейки',
  eclairs:     'Эклеры',
  croissants:  'Круассаны',
};

// Format integer price as "85 000" (space-separated thousands, regular spaces)
export function formatPrice(price) {
  return String(Math.round(price || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Returns an HTML string for a single product card.
 *
 * Options:
 *   showTodayBadge {boolean} — show "✓ Сегодня" badge when isTodayShowcase=true (default true)
 *   showHitBadge   {boolean} — show "🔥 Хит" badge when isPopular=true (default false)
 *   index          {number}  — card index for stagger animation via CSS --i variable
 */
export function renderProductCard(p, { showTodayBadge = true, showHitBadge = false, hideDescription = false, index = 0 } = {}) {
  const imgContent = p.photo
    ? `<img class="pc-photo" src="${esc(p.photo)}" alt="${esc(p.title)}" loading="lazy" decoding="async">`
    : '';
  const spinner = p.photo ? '<span class="pc-spinner" aria-hidden="true"></span>' : '';

  let badge = '';
  if (showHitBadge && p.isPopular) {
    badge = '<a href="catalog.html?filter=popular" class="pc-badge badge-hit" aria-label="Популярное" title="Популярное"><i class="ti ti-star-filled"></i></a>';
  } else if (showTodayBadge && p.isTodayShowcase) {
    badge = '<span class="pc-badge badge-today">✓ Сегодня</span>';
  }

  const isWeight = p.unitType === 'weight'
    && p.minWeight && p.maxWeight && p.weightStep;

  let foot;
  let weightAttrs = '';

  let dataPrice = p.price || 0;

  if (isWeight) {
    // Show actual starting price for the minimum purchasable weight (not per 100g)
    const startPrice = Math.round((p.price * p.minWeight) / 1000);
    const priceHint  = `от ${formatPrice(startPrice)} / ${formatWeight(p.minWeight)}`;
    dataPrice = startPrice;
    foot = `
      <div class="pc-price-hint">${priceHint}</div>
      <button class="pc-add" aria-label="Выбрать граммовку">+</button>`;
    weightAttrs = ` data-unit-type="weight" data-price-per-kg="${p.price || 0}"
         data-weight-step="${p.weightStep}" data-min-weight="${p.minWeight}" data-max-weight="${p.maxWeight}"`;
  } else {
    foot = `
      <div class="pc-price">${formatPrice(p.price)} <span>сум</span></div>
      <button class="pc-add" aria-label="Добавить в корзину">+</button>`;
  }

  return `
    <div class="product-card"
         style="--i:${index}"
         data-product-id="${esc(String(p.id))}"
         data-category="${esc(p.category || '')}"
         data-is-popular="${p.isPopular ? 'true' : ''}"
         data-price="${dataPrice}"${weightAttrs}>
      <div class="pc-img">
        <div class="pc-ph">${imgContent}</div>
        ${spinner}
        ${badge}
        <button class="pc-fav" aria-label="Добавить в избранное">♡</button>
      </div>
      <div class="pc-body">
        <h3 class="pc-name">${esc(p.title)}</h3>
        ${!hideDescription ? `<p class="pc-desc">${esc(p.description || '')}</p>` : ''}
        <div class="pc-foot">
          ${foot}
        </div>
      </div>
    </div>`;
}

/**
 * Wires load/error handlers for .pc-photo images in a rendered grid.
 * Call after grid.innerHTML is set, alongside syncAddButtons / syncFavButtons.
 *
 * - Cached images (img.complete) are marked loaded immediately — no spinner flash.
 * - Loaded images fade in via .is-loaded class.
 * - Errored images hide the spinner; broken img is removed so pc-ph stays clean.
 */
export function wireCardImages(grid) {
  grid.querySelectorAll('.pc-photo').forEach(img => {
    const pcImg  = img.closest('.pc-img');
    const spinner = pcImg?.querySelector('.pc-spinner');

    const markLoaded = () => {
      img.classList.add('is-loaded');
      if (spinner) spinner.hidden = true;
    };

    const markError = () => {
      if (spinner) spinner.hidden = true;
      img.style.display = 'none';
    };

    if (img.complete) {
      // naturalWidth === 0 means failed (e.g. 404 hit from cache)
      if (img.naturalWidth > 0) markLoaded();
      else markError();
    } else {
      img.addEventListener('load',  markLoaded, { once: true });
      img.addEventListener('error', markError,  { once: true });
    }
  });
}
