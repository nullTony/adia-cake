// ================================
//  STOREFRONT — Homepage product sections
//
//  TODAY SHOWCASE:  always from branch_products (is_available_today=true)
//                   for the selected branch.
//
//  FEATURED:        top popular products for the selected branch.
//
//  Branch context comes from the branch selector modal (branch-selector.js).
//  This module never modifies branch selection — it only reacts to it.
// ================================

import { getBranchProducts }      from '../api/branch-products-api.js';
import { renderProductCard }      from './product-card.js';
import { syncAddButtons, syncWeightButtons } from './cart.js';
import { syncFavButtons }         from './favorites.js';
import { getSelectedBranch }      from '../store/branch-store.js';
import { initFeatCarousel }       from './featured-carousel.js';
import { createProductSkeletons } from '../utils/skeleton.js';

// Last loaded products — used to refresh category counts after showcase re-renders
let _lastProducts = [];

export async function initStorefront() {
  const branch = getSelectedBranch();

  if (branch?.id) {
    await Promise.all([
      _renderToday(branch.id),
      _renderFeatured(branch.id),
    ]);
  } else {
    _showNoBranchState();
  }

  // Re-render whenever branch changes (from header indicator or modal)
  window.addEventListener('adia:branch-change', async e => {
    const newBranch = e.detail?.branch;
    await Promise.all([
      _renderToday(newBranch?.id || null),
      _renderFeatured(newBranch?.id || null),
    ]);
  });

  // categories-showcase.js re-renders the cat-grid after storefront already wrote counts.
  // Re-apply counts whenever the showcase signals it's done rendering.
  window.addEventListener('adia:categories-rendered', () => {
    _renderCategoryCounts(_lastProducts);
  });
}

// ── Today showcase ─────────────────────────────────────────────────────────────

function _showNoBranchState() {
  const grid = document.querySelector('#today .products-grid');
  if (grid) {
    grid.innerHTML = '<p style="padding:24px;text-align:center;color:var(--text-light)">Выберите филиал для просмотра витрины.</p>';
  }
  _lastProducts = [];
  _renderCategoryCounts([]);
}

async function _renderToday(branchId) {
  const grid = document.querySelector('#today .products-grid');
  if (!grid) return;

  if (!branchId) {
    _showNoBranchState();
    return;
  }

  grid.innerHTML = createProductSkeletons(6);

  let items = [];
  try {
    items = await getBranchProducts(branchId);
  } catch (err) {
    console.error('[storefront] today load error:', err);
  }

  _lastProducts = items;
  _renderCategoryCounts(items);

  if (!items.length) {
    grid.innerHTML = '<p style="padding:24px;text-align:center;color:var(--text-light)">Витрина сегодня пуста — загляните позже.</p>';
    return;
  }

  grid.innerHTML = items.map(p => renderProductCard(p, { showTodayBadge: true })).join('');
  syncAddButtons();
  syncWeightButtons();
  syncFavButtons();
}

// ── Category counts ────────────────────────────────────────────────────────────

function _fmtCount(n) {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} позиций`;
  if (mod10 === 1)                   return `${n} позиция`;
  if (mod10 >= 2 && mod10 <= 4)     return `${n} позиции`;
  return `${n} позиций`;
}

function _renderCategoryCounts(products) {
  const counts  = {};
  products.forEach(p => {
    if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
  });

  // When products array is non-empty we have real branch data — hide cards with 0 items.
  // When empty (no branch selected yet) keep all cards visible.
  const hasData = products.length > 0;

  document.querySelectorAll('.cat-card').forEach(card => {
    const countEl = card.querySelector('.cat-count');
    if (!countEl) return;
    let slug = '';
    try {
      slug = new URL(card.getAttribute('href') || '', window.location.href)
        .searchParams.get('category') || '';
    } catch {}
    if (!slug) return; // "Все категории" card — always visible

    const n = counts[slug] || 0;
    if (!hasData) {
      card.hidden = false;
      countEl.hidden = true;
    } else if (n > 0) {
      countEl.textContent = _fmtCount(n);
      countEl.hidden = false;
      card.hidden = false;
    } else {
      card.hidden = true; // category exists but 0 products in this branch
    }
  });
}

// ── Featured ──────────────────────────────────────────────────────────────────

async function _renderFeatured(branchId) {
  const grid = document.querySelector('.featured .feat-grid');
  if (!grid) return;

  if (!branchId) { grid.innerHTML = ''; return; }

  grid.innerHTML = createProductSkeletons(4);

  let items = [];
  try {
    items = await getBranchProducts(branchId, { popularOnly: true, limit: 4 });
  } catch (err) {
    console.error('[storefront] featured load error:', err);
    grid.innerHTML = '';
    return;
  }

  if (!items.length) { grid.innerHTML = ''; return; }

  grid.innerHTML = items.map(p => renderProductCard(p, { showHitBadge: true, hideDescription: true })).join('');
  syncAddButtons();
  syncWeightButtons();
  syncFavButtons();
  initFeatCarousel(grid); // no-op on desktop; carousel on mobile
}
