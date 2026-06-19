// ================================
//  CATEGORIES SHOWCASE — Homepage
//
//  Renders the popular categories grid dynamically from Supabase.
//  Falls back to static HTML if fetch fails or returns nothing.
//
//  Category counts come from storefront.js via _renderCategoryCounts(),
//  which reads .cat-count inside each .cat-card after products load.
//  So this module only needs to render the card structure — counts
//  will be updated by storefront when branch products are available.
// ================================

import { getPopularCategories } from '../api/categories-api.js';

// Gradient classes cycle for cards without a photo (matches _category-card.scss)
const GRAD_CLASSES = ['c1', 'c2', 'c3', 'c4', 'c5'];

const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

function _buildCard(cat, index) {
  const gradClass = GRAD_CLASSES[index % GRAD_CLASSES.length];
  const isTall = index === 0; // first card is tall (spans 2 rows on desktop)
  const href = cat.externalLink || (cat.slug ? `catalog.html?category=${encodeURIComponent(cat.slug)}` : 'catalog.html');
  const isNew = cat.createdAt && (Date.now() - new Date(cat.createdAt).getTime() < MS_30_DAYS);

  const imgContent = cat.imageUrl
    ? `<img src="${_esc(cat.imageUrl)}" alt="${_esc(cat.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
    : '';

  const badge = isNew ? `<div class="cat-badge-new">Новинки</div>` : '';

  return `
    <a href="${href}" class="cat-card${isTall ? ' tall' : ''}" style="--i:${index}">
      ${badge}
      <div class="cat-ph-wrap">
        <div class="cat-ph ${gradClass}">${imgContent}</div>
      </div>
      <div class="cat-overlay">
        <span class="cat-overlay-cta">Смотреть</span>
      </div>
      <div class="cat-body">
        <div class="cat-name">${_esc(cat.title)}</div>
        <div class="cat-count">Загрузка…</div>
        <div class="cat-arrow">→</div>
      </div>
    </a>`;
}

function _esc(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function _render() {
  const grid = document.querySelector('.cat-grid');
  if (!grid) return;

  let categories = [];
  try {
    categories = await getPopularCategories(8);
  } catch (err) {
    console.warn('[categories-showcase] fetch error:', err);
  }

  // If Supabase returns nothing (table not updated yet / no popular set),
  // keep the existing static HTML so the page doesn't go blank.
  if (!categories.length) return;

  grid.innerHTML = categories.map((cat, i) => _buildCard(cat, i)).join('');
}

export function initCategoriesShowcase() {
  _render();
}
