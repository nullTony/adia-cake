// ================================
//  CATEGORIES SHOWCASE — Homepage
//
//  Renders the popular categories grid dynamically from Supabase.
//  Falls back to static HTML if fetch fails or returns nothing.
//
//  Category counts come from storefront.js via _renderCategoryCounts().
//  After re-rendering the grid we fire 'adia:categories-rendered' so
//  storefront knows to refresh counts on the new cards.
// ================================

import { getPopularCategories, getPopularCategoriesForBranch } from '../api/categories-api.js';
import { getSelectedBranchId }   from '../store/branch-store.js';
import { createCategorySkeletons } from '../utils/skeleton.js';
import { esc as _esc }            from '../utils/format.js';

const GRAD_CLASSES = ['c1', 'c2', 'c3', 'c4', 'c5'];
const MS_30_DAYS   = 30 * 24 * 60 * 60 * 1000;

function _buildCard(cat, index) {
  const gradClass = GRAD_CLASSES[index % GRAD_CLASSES.length];
  const isTall    = index === 0;
  const href      = cat.externalLink || (cat.slug ? `catalog.html?category=${encodeURIComponent(cat.slug)}` : 'catalog.html');
  const isNew     = cat.createdAt && (Date.now() - new Date(cat.createdAt).getTime() < MS_30_DAYS);
  const imgContent = cat.imageUrl
    ? `<img src="${_esc(cat.imageUrl)}" alt="${_esc(cat.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
    : '';
  const badge = isNew ? `<div class="cat-badge-new">Новинки</div>` : '';

  return `
    <a href="${href}" class="cat-card${isTall ? ' tall' : ''}" style="--i:${index}">
      ${badge}
      <div class="cat-ph-wrap"><div class="cat-ph ${gradClass}">${imgContent}</div></div>
      <div class="cat-overlay"><span class="cat-overlay-cta">Смотреть</span></div>
      <div class="cat-body">
        <div class="cat-name">${_esc(cat.title)}</div>
        <div class="cat-count">Загрузка…</div>
        <div class="cat-arrow">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4"/>
          </svg>
        </div>
      </div>
    </a>`;
}

// "Все категории" — always the last card; fills empty grid slot
function _buildAllCard(index) {
  return `
    <a href="catalog.html" class="cat-card cat-card--all" style="--i:${index}">
      <div class="cat-ph-wrap"><div class="cat-ph cat-ph--all"></div></div>
      <div class="cat-overlay"><span class="cat-overlay-cta">Смотреть</span></div>
      <div class="cat-body">
        <div class="cat-name">Все категории</div>
        <div class="cat-count">Весь каталог</div>
        <div class="cat-arrow">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4"/>
          </svg>
        </div>
      </div>
    </a>`;
}

async function _render() {
  const grid = document.querySelector('.cat-grid');
  if (!grid) return;

  grid.innerHTML = createCategorySkeletons(5);

  let categories = [];
  try {
    const branchId = getSelectedBranchId();
    categories = branchId
      ? await getPopularCategoriesForBranch(branchId)
      : await getPopularCategories(8);
  } catch (err) {
    console.warn('[categories-showcase] fetch error:', err);
  }

  if (!categories.length) {
    grid.innerHTML = '';
    return;
  }

  const cards = categories.map((cat, i) => _buildCard(cat, i));
  cards.push(_buildAllCard(categories.length));
  grid.innerHTML = cards.join('');

  // Tell storefront to refresh counts on the newly rendered cards
  window.dispatchEvent(new CustomEvent('adia:categories-rendered'));
}

export function initCategoriesShowcase() {
  _render();
  window.addEventListener('adia:branch-change', () => _render());
}
