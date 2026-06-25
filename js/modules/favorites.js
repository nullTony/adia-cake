// ================================
//  FAVOURITES MODULE
// ================================

import {
  getFavorites, toggleFavorite, removeFromFavorites,
  isFavorite, getFavCount, clearFavorites,
} from '../store/fav-store.js';
import { openPanel, closeAllPanels } from './cart.js';
import { guardAction } from './auth-guard.js';
import { esc }        from '../utils/format.js';

function readProductFromCard(card) {
  const id = card.dataset.productId;
  if (!id) return null;

  const name = card.querySelector('.pc-name')?.textContent.trim() || '';

  const priceEl = card.querySelector('.pc-price');
  let priceStr = '0';
  let unit = 'сум';
  if (priceEl) {
    const span = priceEl.querySelector('span');
    unit = span?.textContent.trim() || 'сум';
    priceStr = priceEl.childNodes[0]?.textContent.trim() || '0';
  }
  const priceVal = parseInt(priceStr.replace(/\s/g, ''), 10) || 0;

  const img = card.querySelector('.pc-ph img, .pc-img img')?.getAttribute('src') || '';

  return { id, name, priceVal, priceStr, unit, img };
}

// ---- Badge ----

export function updateFavBadge() {
  const el = document.getElementById('favCount');
  if (!el) return;
  const count = getFavCount();
  el.textContent = count > 9 ? '9+' : count;
  if (count > 0) {
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ---- Button states ----

export function syncFavButtons() {
  document.querySelectorAll('.product-card[data-product-id]').forEach(card => {
    const id = card.dataset.productId;
    const btn = card.querySelector('.pc-fav');
    if (!btn) return;
    if (isFavorite(id)) {
      btn.textContent = '♥';
      btn.classList.add('active');
      btn.style.color = '#E8506A';
    } else {
      btn.textContent = '♡';
      btn.classList.remove('active');
      btn.style.color = '';
    }
  });
}

// ---- Panel rendering ----

export function renderFavPanel() {
  const list = document.getElementById('favList');
  if (!list) return;

  const favs = getFavorites();

  if (favs.length === 0) {
    list.innerHTML = `
      <div class="panel-empty">
        <div class="panel-empty-ico">♡</div>
        <p class="panel-empty-text">Избранное пусто</p>
        <p class="panel-empty-sub">Добавляйте понравившиеся десерты</p>
      </div>`;
    return;
  }

  list.innerHTML = favs.map(item => `
    <div class="fav-item" data-id="${esc(item.id)}">
      <div class="fi-img">
        <img src="${esc(item.img || '')}" alt="${esc(item.name)}">
      </div>
      <div class="fi-info">
        <p class="fi-name">${esc(item.name)}</p>
        <p class="fi-price">${esc(item.priceStr)} ${esc(item.unit)}</p>
      </div>
      <button class="fi-remove" data-id="${esc(item.id)}" aria-label="Удалить из избранного">✕</button>
    </div>`).join('');
}

// ---- Init ----

export function initFavorites() {
  updateFavBadge();
  syncFavButtons();

  // Listen for favorites changes from other tabs (cross-tab sync)
  window.addEventListener('storage', e => {
    if (e.key === 'adia_favorites') {
      updateFavBadge();
      syncFavButtons();
    }
  });

  // Toggle favourite — heart button on cards
  document.addEventListener('click', e => {
    const btn = e.target.closest('.pc-fav');
    if (!btn) return;
    const card = btn.closest('.product-card[data-product-id]');
    if (!card) return;
    const product = readProductFromCard(card);
    if (!product) return;

    guardAction(() => {
      toggleFavorite(product);
      syncFavButtons();
      updateFavBadge();
      renderFavPanel();
    });
  });

  // Open favourites panel
  document.getElementById('favBtn')?.addEventListener('click', () => {
    renderFavPanel();
    openPanel('favPanel');
  });

  // Close button inside panel
  document.getElementById('favClose')?.addEventListener('click', closeAllPanels);

  // Remove from panel (delegated)
  document.getElementById('favList')?.addEventListener('click', e => {
    const removeBtn = e.target.closest('.fi-remove');
    if (!removeBtn) return;
    removeFromFavorites(removeBtn.dataset.id);
    syncFavButtons();
    updateFavBadge();
    renderFavPanel();
  });

  window.addEventListener('adia:auth-change', e => {
    if (!e.detail?.user) clearFavorites(); // user logged out — wipe for next user
    updateFavBadge();
    syncFavButtons();
    renderFavPanel();
  });
}
