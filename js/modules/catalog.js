// ================================
//  CATALOG MODULE
//
//  All products come from branch_products → products join.
//  Branch context comes from the branch selector modal (branch-selector.js).
//  This module never modifies branch selection — it only reacts to it.
// ================================

import { getCategories, getCategoriesByBranch } from '../api/categories-api.js';
import { getBranchProducts }      from '../api/branch-products-api.js';
import { renderProductCard }      from './product-card.js';
import { syncAddButtons, syncWeightButtons } from './cart.js';
import { syncFavButtons }         from './favorites.js';
import { getSelectedBranch }      from '../store/branch-store.js';

const PRICE_MIN = 0;

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initCatalog() {
  const grid    = document.querySelector('.cat-main .products-grid');
  const countEl = document.getElementById('catResultsCount');
  if (!grid) return;

  const branch = getSelectedBranch();
  if (branch?.id) {
    await _loadAndRender(grid, countEl, branch.id);
  } else {
    grid.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-light)">Выберите филиал для просмотра каталога.</p>';
  }

  // React to branch changes
  window.addEventListener('adia:branch-change', async e => {
    const newBranch = e.detail?.branch;
    if (newBranch?.id) {
      await _loadAndRender(grid, countEl, newBranch.id);
    } else {
      grid.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-light)">Выберите филиал для просмотра каталога.</p>';
      if (countEl) countEl.innerHTML = '';
    }
  });
}

// ── Load and render ───────────────────────────────────────────────────────────

async function _loadAndRender(grid, countEl, branchId) {
  grid.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-light)">Загрузка товаров…</p>';
  if (countEl) countEl.innerHTML = '';

  _resetFilterState();

  let products;
  try {
    products = await getBranchProducts(branchId);
  } catch (err) {
    grid.innerHTML = `<p style="padding:40px;text-align:center;color:#E8506A">Ошибка загрузки: ${err.message}</p>`;
    return;
  }

  if (!products.length) {
    grid.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-light)">Сегодня в этом филиале нет доступных товаров</p>';
    if (countEl) countEl.innerHTML = 'Показано: <strong>0</strong>';
    return;
  }

  grid.innerHTML = products.map(p => renderProductCard(p)).join('');
  syncAddButtons();
  syncWeightButtons();
  syncFavButtons();

  const cards = Array.from(grid.querySelectorAll('.product-card[data-product-id]'));

  const maxFromProducts = Math.max(...cards.map(c => parseInt(c.dataset.price, 10) || 0));
  const PRICE_MAX = Math.max(Math.ceil(maxFromProducts / 5000) * 5000, 5000);

  const sliderEl = document.getElementById('priceSlider');
  const labelsEl = document.querySelector('.cat-price-labels');
  if (sliderEl) { sliderEl.max = PRICE_MAX; sliderEl.value = PRICE_MAX; }
  if (labelsEl) {
    const spans = labelsEl.querySelectorAll('span');
    if (spans[1]) spans[1].textContent = (PRICE_MAX / 1000).toFixed(0) + ' 000';
  }

  await _loadCategoryButtons(cards, branchId);
  _initFilters(cards, grid, PRICE_MAX, countEl);
}

// ── Reset filter UI between branch loads ──────────────────────────────────────

function _resetFilterState() {
  document.querySelectorAll('.cat-cat-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  const slider = document.getElementById('priceSlider');
  if (slider) slider.value = slider.max;
  const priceDisp = document.getElementById('priceDisplay');
  if (priceDisp) priceDisp.textContent = '';
}

// ── Dynamic category buttons ──────────────────────────────────────────────────

async function _loadCategoryButtons(cards, branchId) {
  const group = document.getElementById('catFilterGroup');
  if (!group) return;

  group.querySelectorAll('[data-cat]:not([data-cat="all"])').forEach(b => b.remove());

  let categories = [];
  try {
    // If branch selected, respect explicit branch-category bindings
    categories = branchId
      ? await getCategoriesByBranch(branchId)
      : await getCategories(true);
  } catch {}
  if (!categories.length) return;

  const usedSlugs = new Set(cards.map(c => c.dataset.category).filter(Boolean));
  categories
    .filter(cat => usedSlugs.has(cat.slug))
    .forEach(cat => {
      const btn = document.createElement('button');
      btn.className   = 'cat-cat-btn';
      btn.dataset.cat = cat.slug;
      btn.textContent = cat.title;
      group.appendChild(btn);
    });
}

// ── Filters ───────────────────────────────────────────────────────────────────

function _initFilters(cards, grid, PRICE_MAX, countEl) {
  const catBtns   = document.querySelectorAll('.cat-cat-btn');
  const slider    = document.getElementById('priceSlider');
  const priceDisp = document.getElementById('priceDisplay');
  const resetBtn  = document.getElementById('catReset');
  const emptyEl   = document.getElementById('catEmpty');
  const badgeEl   = document.getElementById('catalogCountBadge');

  let activeCategory = 'all';
  let maxPrice       = PRICE_MAX;

  function formatPriceLabel(val) {
    return (val / 1000).toFixed(0) + ' 000 сум';
  }

  function updateSliderTrack() {
    if (!slider) return;
    const pct = ((maxPrice - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
    slider.style.setProperty('--pct', pct + '%');
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function applyFilters() {
    let visible = 0;
    cards.forEach(card => {
      const cat   = card.dataset.category || '';
      const price = parseInt(card.dataset.price, 10) || 0;
      const show  = (activeCategory === 'all' || cat === activeCategory) && price <= maxPrice;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    if (countEl) countEl.innerHTML = `Показано: <strong>${visible}</strong> из <strong>${cards.length}</strong>`;
    if (emptyEl) emptyEl.classList.toggle('visible', visible === 0);
    if (badgeEl) badgeEl.textContent = visible + ' ' + plural(visible, 'десерт', 'десерта', 'десертов');
  }

  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      catBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat || 'all';
      applyFilters();
    });
  });

  if (slider) {
    slider.min = PRICE_MIN; slider.max = PRICE_MAX; slider.value = PRICE_MAX;
    updateSliderTrack();
    slider.addEventListener('input', () => {
      maxPrice = parseInt(slider.value, 10);
      if (priceDisp) priceDisp.textContent = 'до ' + formatPriceLabel(maxPrice);
      updateSliderTrack();
      applyFilters();
    });
  }

  resetBtn?.addEventListener('click', () => {
    activeCategory = 'all';
    maxPrice = PRICE_MAX;
    catBtns.forEach((b, i) => b.classList.toggle('active', i === 0));
    if (slider)    { slider.value = PRICE_MAX; updateSliderTrack(); }
    if (priceDisp) priceDisp.textContent = 'до ' + formatPriceLabel(PRICE_MAX);
    applyFilters();
  });

  const urlCat = new URLSearchParams(window.location.search).get('category');
  if (urlCat) {
    const matchBtn = Array.from(catBtns).find(b => b.dataset.cat === urlCat);
    if (matchBtn) {
      catBtns.forEach(b => b.classList.remove('active'));
      matchBtn.classList.add('active');
      activeCategory = urlCat;
    }
  }

  if (priceDisp) priceDisp.textContent = 'до ' + formatPriceLabel(PRICE_MAX);
  applyFilters();
}
