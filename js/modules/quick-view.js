// ================================
//  QUICK VIEW MODAL
//  Opens when user clicks "+" on any product card (piece or weight).
//  Handles gram selection, qty, favorites, and add-to-cart.
// ================================

import { getCart, addToCart, updateQty }                            from '../store/cart-store.js';
import { isFavorite, toggleFavorite }                               from '../store/fav-store.js';
import { updateCartBadge, syncAddButtons, syncWeightButtons, renderCartPanel } from './cart.js';
import { updateFavBadge, syncFavButtons, renderFavPanel }           from './favorites.js';
import { guardAction }                                              from './auth-guard.js';
import { calculateWeightPrice, formatWeight, generateWeightOptions } from '../utils/weight.js';
import { getSelectedBranchId }                                      from '../store/branch-store.js';
import { esc }                                                      from '../utils/format.js';

// ── Helpers ───────────────────────────────────────────────────────

// Formats price without currency suffix — used inline in template literals that append ' сум' separately
function fmt(val) {
  return String(Math.round(val || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ── Read product data from a card element ─────────────────────────

function productFromCard(card) {
  const isWeight = card.dataset.unitType === 'weight';
  return {
    id:          card.dataset.productId,
    title:       card.querySelector('.pc-name')?.textContent.trim() || '',
    description: card.querySelector('.pc-desc')?.textContent.trim() || '',
    photo:       card.querySelector('.pc-ph img, .pc-img img')?.src || '',
    price:       parseInt(isWeight ? card.dataset.pricePerKg : card.dataset.price, 10) || 0,
    category:    card.dataset.category || '',
    unitType:    isWeight ? 'weight' : 'piece',
    minWeight:   parseInt(card.dataset.minWeight,  10) || null,
    maxWeight:   parseInt(card.dataset.maxWeight,  10) || null,
    weightStep:  parseInt(card.dataset.weightStep, 10) || null,
  };
}

// ── Modal injection ───────────────────────────────────────────────

function ensureModal() {
  if (document.getElementById('qvOverlay')) return;
  const el = document.createElement('div');
  el.id        = 'qvOverlay';
  el.className = 'qv-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Быстрый просмотр');
  el.innerHTML = `
    <div class="qv-modal">
      <button class="qv-close" id="qvClose" aria-label="Закрыть">✕</button>
      <div class="qv-layout">
        <div class="qv-img-wrap" id="qvImgWrap"></div>
        <div class="qv-info"    id="qvInfo"></div>
      </div>
    </div>`;
  document.body.appendChild(el);
}

// ── Module state ──────────────────────────────────────────────────

let _product      = null;
let _qty          = 1;
let _selectedGrams = null;

// ── Open ──────────────────────────────────────────────────────────

export function openQuickView(product) {
  _product = product;

  if (product.unitType === 'weight') {
    const opts     = generateWeightOptions(product.minWeight, product.maxWeight, product.weightStep);
    _selectedGrams = opts[0] ?? product.minWeight;
    _qty           = 1;
  } else {
    const cartItem = getCart().find(i => i.id === product.id);
    _qty           = cartItem ? cartItem.qty : 1;
    _selectedGrams = null;
  }

  _render(product);

  const overlay = document.getElementById('qvOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('qvClose')?.focus();
}

// ── Close ─────────────────────────────────────────────────────────

function _close() {
  document.getElementById('qvOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  _product = null;
}

// ── Render ────────────────────────────────────────────────────────

function _render(p) {
  // Image side
  const imgWrap = document.getElementById('qvImgWrap');
  if (imgWrap) {
    imgWrap.innerHTML = p.photo
      ? `<img src="${esc(p.photo)}" alt="${esc(p.title)}" class="qv-img">`
      : `<div class="qv-img-placeholder">🎂</div>`;
  }

  // Info side
  const info = document.getElementById('qvInfo');
  if (!info) return;

  const isWeight = p.unitType === 'weight';
  const isFav    = isFavorite(p.id);

  let controls = '';
  let priceHTML = '';

  if (isWeight) {
    const opts  = generateWeightOptions(p.minWeight, p.maxWeight, p.weightStep);
    const wBtns = opts.map(g =>
      `<button class="qv-w-btn${g === _selectedGrams ? ' qv-w-btn--sel' : ''}" data-grams="${g}">${formatWeight(g)}</button>`
    ).join('');
    const price = calculateWeightPrice(p.price, _selectedGrams ?? opts[0]);
    controls  = `<div class="qv-weight-btns" id="qvWeightBtns">${wBtns}</div>`;
    priceHTML = `<div class="qv-price" id="qvPrice">${fmt(price)} <span>сум</span></div>`;
  } else {
    controls  = `
      <div class="qv-qty-row">
        <button class="qv-qty-btn" id="qvDec">−</button>
        <span class="qv-qty-val" id="qvQtyVal">${_qty}</span>
        <button class="qv-qty-btn" id="qvInc">+</button>
      </div>`;
    priceHTML = `<div class="qv-price" id="qvPrice">${fmt(p.price * _qty)} <span>сум</span></div>`;
  }

  info.innerHTML = `
    <h2 class="qv-title">${esc(p.title)}</h2>
    <p class="qv-desc">${esc(p.description || '')}</p>
    <div class="qv-controls">
      ${controls}
      ${priceHTML}
    </div>
    <div class="qv-actions">
      <button class="qv-fav-btn${isFav ? ' qv-fav-btn--active' : ''}" id="qvFavBtn">
        ${isFav ? '♥ В избранном' : '♡ В избранное'}
      </button>
      <button class="btn btn-dark qv-cart-btn" id="qvCartBtn">
        <i class="ti ti-shopping-cart"></i>
        Добавить в корзину
      </button>
    </div>`;

  _wireInfo(p, isWeight);
}

// ── Wire info-panel interactions ──────────────────────────────────

function _wireInfo(p, isWeight) {
  if (isWeight) {
    document.getElementById('qvWeightBtns')?.addEventListener('click', e => {
      const btn = e.target.closest('.qv-w-btn');
      if (!btn) return;
      const g = parseInt(btn.dataset.grams, 10);
      if (g === _selectedGrams) return; // clicking same button does nothing
      _selectedGrams = g;
      document.querySelectorAll('#qvWeightBtns .qv-w-btn').forEach(b =>
        b.classList.toggle('qv-w-btn--sel', parseInt(b.dataset.grams, 10) === _selectedGrams)
      );
      const priceEl = document.getElementById('qvPrice');
      if (priceEl) priceEl.innerHTML = `${fmt(calculateWeightPrice(p.price, _selectedGrams))} <span>сум</span>`;
    });
  } else {
    document.getElementById('qvDec')?.addEventListener('click', () => {
      if (_qty <= 1) return;
      _qty--;
      _updatePiecePrice(p);
    });
    document.getElementById('qvInc')?.addEventListener('click', () => {
      _qty++;
      _updatePiecePrice(p);
    });
  }

  document.getElementById('qvFavBtn')?.addEventListener('click', () => {
    guardAction(() => {
      const nowFav = toggleFavorite({
        id:       p.id,
        name:     p.title,
        priceVal: p.price,
        priceStr: fmt(p.price),
        unit:     'сум',
        img:      p.photo,
      });
      const btn = document.getElementById('qvFavBtn');
      if (btn) {
        btn.textContent = nowFav ? '♥ В избранном' : '♡ В избранное';
        btn.classList.toggle('qv-fav-btn--active', nowFav);
      }
      updateFavBadge();
      syncFavButtons();
      renderFavPanel();
    });
  });

  document.getElementById('qvCartBtn')?.addEventListener('click', () => {
    guardAction(() => _addToCart(p));
  });
}

function _updatePiecePrice(p) {
  const valEl   = document.getElementById('qvQtyVal');
  const priceEl = document.getElementById('qvPrice');
  if (valEl)   valEl.textContent   = _qty;
  if (priceEl) priceEl.innerHTML   = `${fmt(p.price * _qty)} <span>сум</span>`;
}

// ── Add to cart from modal ────────────────────────────────────────

function _addToCart(p) {
  const cartBtn = document.getElementById('qvCartBtn');

  const branchId = getSelectedBranchId();

  if (p.unitType === 'weight') {
    if (!_selectedGrams) return;
    const id       = `${p.id}_${_selectedGrams}`;
    const name     = `${p.title} (${formatWeight(_selectedGrams)})`;
    const priceVal = calculateWeightPrice(p.price, _selectedGrams);
    addToCart({ id, productId: p.id, name, priceVal, priceStr: fmt(priceVal), unit: 'сум', img: p.photo, weightGrams: _selectedGrams, pricePerKg: p.price, minWeight: p.minWeight, maxWeight: p.maxWeight, weightStep: p.weightStep }, branchId);
  } else {
    const existingItem = getCart().find(i => i.id === p.id);
    if (existingItem) {
      updateQty(p.id, _qty);
    } else {
      addToCart({ id: p.id, name: p.title, priceVal: p.price, priceStr: fmt(p.price), unit: 'сум', img: p.photo }, branchId);
      if (_qty > 1) updateQty(p.id, _qty);
    }
  }

  updateCartBadge();
  syncAddButtons();
  syncWeightButtons();
  renderCartPanel();
  _close();
}

// ── Init ──────────────────────────────────────────────────────────

export function initQuickView() {
  ensureModal();

  // Open on "+" click on any product card
  document.addEventListener('click', e => {
    const addBtn = e.target.closest('.pc-add');
    if (!addBtn) return;
    const card = addBtn.closest('.product-card[data-product-id]');
    if (!card) return;
    openQuickView(productFromCard(card));
  }, true); // capture phase → runs before cart.js bubble handlers

  // Close on backdrop click
  document.getElementById('qvOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('qvOverlay')) _close();
  });

  // Close on × button (delegated — modal content is re-rendered)
  document.addEventListener('click', e => {
    if (e.target.closest('#qvClose')) _close();
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('qvOverlay')?.classList.contains('open')) {
      _close();
    }
  });
}
