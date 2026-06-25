// ================================
//  CART MODULE
// ================================

import {
  getCart, addToCart, removeFromCart, updateQty,
  isInCart, getCartUniqueCount, getCartTotal, clearCart,
} from '../store/cart-store.js';
import { calculateWeightPrice, formatWeight, generateWeightOptions } from '../utils/weight.js';
import { esc }                                                       from '../utils/format.js';

// Uses toLocaleString for locale-aware formatting — intentionally different from shared formatPrice
function formatPrice(val) {
  return val.toLocaleString('ru-RU') + ' сум';
}

function fmtNum(val) {
  return Math.round(val || 0).toLocaleString('ru-RU');
}

// Get weight config for a cart item.
// Tries stored fields first, then reads from the product card on the current page.
function _weightConfig(item) {
  if (item.minWeight && item.maxWeight && item.weightStep && item.pricePerKg) {
    return { min: item.minWeight, max: item.maxWeight, step: item.weightStep, pricePerKg: item.pricePerKg };
  }
  const pid  = item.productId || String(item.id).split('_').slice(0, -1).join('_');
  const card = document.querySelector(`.product-card[data-product-id="${pid}"][data-unit-type="weight"]`);
  if (!card) return null;
  const min        = parseInt(card.dataset.minWeight,  10);
  const max        = parseInt(card.dataset.maxWeight,  10);
  const step       = parseInt(card.dataset.weightStep, 10);
  const pricePerKg = parseInt(card.dataset.pricePerKg, 10);
  if (!min || !max || !step || !pricePerKg) return null;
  return { min, max, step, pricePerKg };
}

// Singleton floating gram picker (appended to body, position:fixed).
function _ensureGramPicker() {
  let el = document.getElementById('cartGramPicker');
  if (el) return el;
  el = document.createElement('div');
  el.id        = 'cartGramPicker';
  el.className = 'cart-gram-picker';
  el.hidden    = true;
  document.body.appendChild(el);
  el.addEventListener('click', e => {
    const btn = e.target.closest('.ci-g-btn');
    if (!btn) return;
    _changeWeightGrams(btn.dataset.id, parseInt(btn.dataset.grams, 10));
    el.hidden = true;
  });
  return el;
}

function _showGramPicker(editBtn, item, cfg) {
  const picker = _ensureGramPicker();
  // Close if already open for this exact item
  if (!picker.hidden && picker.dataset.itemId === item.id) {
    picker.hidden = true;
    return;
  }
  picker.dataset.itemId = item.id;
  const opts = generateWeightOptions(cfg.min, cfg.max, cfg.step);
  picker.innerHTML = opts.map(g =>
    `<button class="ci-g-btn${g === item.weightGrams ? ' ci-g-btn--sel' : ''}"
             data-grams="${g}" data-id="${item.id}">${formatWeight(g)}</button>`
  ).join('');

  picker.hidden = false;
  // Position above the edit button (preferred), fall back to below
  const rect = editBtn.getBoundingClientRect();
  const h    = picker.offsetHeight || 160;
  const top  = rect.top - h - 8 > 8 ? rect.top - h - 8 : rect.bottom + 8;
  const left = Math.min(Math.max(rect.right - picker.offsetWidth, 12), window.innerWidth - picker.offsetWidth - 12);
  picker.style.top  = top  + 'px';
  picker.style.left = left + 'px';
}

function _changeWeightGrams(oldId, grams) {
  const oldItem = getCart().find(i => i.id === oldId);
  if (!oldItem || grams === oldItem.weightGrams) return;
  const cfg      = _weightConfig(oldItem);
  const pkgPrice = cfg ? cfg.pricePerKg : Math.round(oldItem.priceVal / oldItem.weightGrams * 1000);
  const pid      = oldItem.productId || String(oldId).split('_').slice(0, -1).join('_');
  const newPrice = calculateWeightPrice(pkgPrice, grams);
  const baseName = oldItem.name.replace(/\s*\([^)]+\)$/, '');
  removeFromCart(oldId);
  addToCart({ ...oldItem, id: `${pid}_${grams}`, name: `${baseName} (${formatWeight(grams)})`,
    weightGrams: grams, priceVal: newPrice, priceStr: fmtNum(newPrice), pricePerKg: pkgPrice });
  updateCartBadge();
  syncAddButtons();
  syncWeightButtons();
  renderCartPanel();
}

// ---- Badge ----

export function updateCartBadge() {
  const el = document.getElementById('cartCount');
  if (!el) return;
  const count = getCartUniqueCount();
  el.textContent = count > 9 ? '9+' : count;
  if (count > 0) {
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ---- Inline card qty controls ----
//
//  When item not in cart  → <button class="pc-add">+</button>
//  When item in cart      → <div class="pc-qty-ctrl">− N +</div>
//
//  We replace whatever action element (.pc-add | .pc-qty-ctrl) sits in .pc-foot.

// ---- Weight button sync ----
// Updates .pc-w-btn active/in-cart state for weight products

export function syncWeightButtons() {
  const cart = getCart();
  document.querySelectorAll('.product-card[data-unit-type="weight"]').forEach(card => {
    const productId = card.dataset.productId;

    // Update gram-option buttons inside quick-view (if rendered on page)
    card.querySelectorAll('.pc-w-btn[data-grams]').forEach(btn => {
      const key = `${productId}_${btn.dataset.grams}`;
      const inCart = cart.some(i => i.id === key);
      btn.classList.toggle('in-cart', inCart);
      if (inCart) btn.dataset.cartQty = cart.find(i => i.id === key)?.qty || 1;
      else         delete btn.dataset.cartQty;
    });

    // Update the card's + button with the same badge logic as piece products
    const foot   = card.querySelector('.pc-foot');
    const addBtn = foot?.querySelector('.pc-add');
    if (!addBtn) return;

    const variants = cart.filter(i => String(i.id).startsWith(productId + '_'));
    if (variants.length > 0) {
      const totalGrams = variants.reduce((s, i) => s + (i.weightGrams || 0) * (i.qty || 1), 0);
      const label = totalGrams < 1000
        ? totalGrams + 'г'
        : (Number.isInteger(totalGrams / 1000) ? totalGrams / 1000 : parseFloat((totalGrams / 1000).toFixed(1))) + 'кг';
      if (addBtn.classList.contains('pc-add--in-cart')) {
        const countEl = addBtn.querySelector('.pc-add-count');
        if (countEl) countEl.textContent = label;
        addBtn.dataset.qty = totalGrams;
        return;
      }
      addBtn.classList.add('pc-add--in-cart');
      addBtn.setAttribute('aria-label', 'В корзине — нажмите для изменения');
      addBtn.dataset.qty = totalGrams;
      addBtn.innerHTML = `<span class="pc-add-count pc-add-count--g">${label}</span>`;
    } else {
      addBtn.classList.remove('pc-add--in-cart');
      addBtn.setAttribute('aria-label', 'Выбрать граммовку');
      addBtn.removeAttribute('data-qty');
      addBtn.textContent = '+';
    }
  });
}

export function syncAddButtons() {
  document.querySelectorAll('.product-card[data-product-id]').forEach(card => {
    // Weight products manage their own buttons — skip
    if (card.dataset.unitType === 'weight') return;

    const id = card.dataset.productId;
    const foot = card.querySelector('.pc-foot');
    if (!foot) return;

    // Migrate legacy pc-qty-ctrl to badge design
    const legacyCtrl = foot.querySelector('.pc-qty-ctrl');
    if (legacyCtrl) legacyCtrl.remove();

    const btn = foot.querySelector('.pc-add') || (() => {
      const b = document.createElement('button');
      b.className = 'pc-add';
      b.setAttribute('aria-label', 'Добавить в корзину');
      foot.appendChild(b);
      return b;
    })();

    if (isInCart(id)) {
      const qty = getCart().find(i => i.id === id)?.qty || 1;
      // Quick update if already in badge mode
      if (btn.classList.contains('pc-add--in-cart')) {
        btn.dataset.qty = qty;
        const countEl = btn.querySelector('.pc-add-count');
        if (countEl) countEl.textContent = qty;
        return;
      }
      btn.classList.add('pc-add--in-cart');
      btn.setAttribute('aria-label', 'В корзине — нажмите для изменения');
      btn.dataset.qty = qty;
      btn.innerHTML = `<span class="pc-add-count">${qty}</span>`;
    } else {
      btn.classList.remove('pc-add--in-cart');
      btn.setAttribute('aria-label', 'Добавить в корзину');
      btn.removeAttribute('data-qty');
      btn.textContent = '+';
    }
  });
}

// ---- Panel rendering ----

export function renderCartPanel() {
  const list = document.getElementById('cartList');
  const footer = document.getElementById('cartFooter');
  if (!list) return;

  const cart = getCart();

  if (cart.length === 0) {
    list.innerHTML = `
      <div class="panel-empty">
        <div class="panel-empty-ico">🛒</div>
        <p class="panel-empty-text">Корзина пуста</p>
        <p class="panel-empty-sub">Добавьте что-нибудь вкусное</p>
      </div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  if (footer) footer.style.display = '';

  list.innerHTML = cart.map(item => {
    const isWeight  = !!item.weightGrams;
    const totalStr  = fmtNum(item.priceVal * item.qty) + ' ' + (item.unit || 'сум');
    let controls;

    if (isWeight) {
      const cfg = _weightConfig(item);
      controls = `
        <div class="ci-weight-row">
          <span class="ci-grams">${formatWeight(item.weightGrams)}</span>
          ${cfg ? `<button class="ci-edit-btn" data-id="${esc(item.id)}" aria-label="Изменить граммовку">
            <i class="ti ti-pencil"></i>
            Изменить
          </button>` : ''}
        </div>`;
    } else {
      controls = `
        <div class="ci-qty">
          <button class="ci-qty-btn" data-action="dec" data-id="${esc(item.id)}">−</button>
          <span class="ci-qty-val">${item.qty}</span>
          <button class="ci-qty-btn" data-action="inc" data-id="${esc(item.id)}">+</button>
        </div>`;
    }

    return `
      <div class="cart-item" data-id="${esc(item.id)}">
        <div class="ci-img"><img src="${esc(item.img || '')}" alt="${esc(item.name)}"></div>
        <div class="ci-info">
          <p class="ci-name">${esc(item.name)}</p>
          <p class="ci-price">${totalStr}</p>
          ${controls}
        </div>
        <button class="ci-remove" data-id="${esc(item.id)}" aria-label="Удалить">✕</button>
      </div>`;
  }).join('');

  const totalEl = document.getElementById('cartTotal');
  if (totalEl) totalEl.textContent = formatPrice(getCartTotal());
}

// ---- Panel open / close (shared util) ----

export function openPanel(panelId) {
  document.getElementById(panelId)?.classList.add('open');
  document.getElementById('panelBackdrop')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeAllPanels() {
  document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
  document.getElementById('panelBackdrop')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ---- Init ----

export function initCart() {
  updateCartBadge();
  syncAddButtons();
  syncWeightButtons();

  // Listen for cart changes from other tabs (cross-tab sync)
  window.addEventListener('storage', e => {
    if (e.key === 'adia_cart') {
      updateCartBadge();
      syncAddButtons();
    }
  });

  // "+" on product cards is handled by quick-view.js — only inline qty controls here
  document.addEventListener('click', e => {
    // Inline card qty controls (− / +) — piece products only
    const cardQtyBtn = e.target.closest('.pc-qty-btn');
    if (cardQtyBtn) {
      const id = cardQtyBtn.dataset.id;
      const item = getCart().find(i => i.id === id);
      if (!item) return;
      const next = cardQtyBtn.dataset.action === 'inc' ? item.qty + 1 : item.qty - 1;
      updateQty(id, next); // updateQty removes when qty <= 0
      updateCartBadge();
      syncAddButtons();
      renderCartPanel();
      return;
    }
  });

  // Open cart panel
  document.getElementById('cartBtn')?.addEventListener('click', () => {
    renderCartPanel();
    openPanel('cartPanel');
  });

  // Close button inside panel
  document.getElementById('cartClose')?.addEventListener('click', closeAllPanels);

  // Backdrop
  document.getElementById('panelBackdrop')?.addEventListener('click', closeAllPanels);

  // Panel qty controls + remove + weight edit (delegated on cartList)
  document.getElementById('cartList')?.addEventListener('click', e => {
    // Piece product qty buttons
    const qtyBtn = e.target.closest('.ci-qty-btn');
    if (qtyBtn) {
      const id = qtyBtn.dataset.id;
      const item = getCart().find(i => i.id === id);
      if (!item) return;
      updateQty(id, qtyBtn.dataset.action === 'inc' ? item.qty + 1 : item.qty - 1);
      updateCartBadge();
      syncAddButtons();
      renderCartPanel();
      return;
    }

    // Remove button
    const removeBtn = e.target.closest('.ci-remove');
    if (removeBtn) {
      removeFromCart(removeBtn.dataset.id);
      updateCartBadge();
      syncAddButtons();
      renderCartPanel();
      return;
    }

    // Weight edit button — show floating gram picker above the button
    const editBtn = e.target.closest('.ci-edit-btn');
    if (editBtn) {
      const item = getCart().find(i => i.id === editBtn.dataset.id);
      if (!item) return;
      const cfg = _weightConfig(item);
      if (!cfg) return;
      _showGramPicker(editBtn, item, cfg);
      return;
    }
  });

  // Close floating picker on outside click
  document.addEventListener('click', e => {
    const picker = document.getElementById('cartGramPicker');
    if (picker && !picker.hidden &&
        !picker.contains(e.target) && !e.target.closest('.ci-edit-btn')) {
      picker.hidden = true;
    }
  });

  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllPanels();
  });

  window.addEventListener('adia:auth-change', e => {
    if (!e.detail?.user) clearCart(); // user logged out — wipe cart for next user
    updateCartBadge();
    syncAddButtons();
    syncWeightButtons();
    renderCartPanel();
  });

  window.addEventListener('adia:branch-change', () => {
    updateCartBadge();
    renderCartPanel();
  });
}
