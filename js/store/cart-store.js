// ================================
//  CART STORE — per-branch localStorage
// ================================
//
//  Cart items are stored per branch: adia_cart__{branchId}
//  Branch is read directly from localStorage (avoids circular import with branch-store).
//
//  Cart item shape:
//  { id, name, priceVal, priceStr, unit, img, qty,
//    weightGrams?, productId?, minWeight?, maxWeight?, weightStep?, pricePerKg? }

const BRANCH_KEY = 'adia_branch'; // written by branch-store.js

function _getCurrentBranchId() {
  try {
    return JSON.parse(localStorage.getItem(BRANCH_KEY))?.id || null;
  } catch { return null; }
}

function _cartKey(branchId) {
  return `adia_cart__${branchId}`;
}

// Public: lets branch-selector.js check another branch's cart without switching
export function getCartForBranch(branchId) {
  if (!branchId) return [];
  try {
    return JSON.parse(localStorage.getItem(_cartKey(branchId))) || [];
  } catch { return []; }
}

export function getCart() {
  const id = _getCurrentBranchId();
  return getCartForBranch(id);
}

function _saveCart(cart) {
  const id = _getCurrentBranchId();
  if (!id) return;
  try {
    localStorage.setItem(_cartKey(id), JSON.stringify(cart));
  } catch { /* localStorage quota exceeded — fail silently */ }
}

export function isInCart(id) {
  return getCart().some(item => item.id === id);
}

// branchId param kept for backward compat with quick-view.js callers — ignored
export function addToCart(product, _branchId = null) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  _saveCart(cart);
}

export function removeFromCart(id) {
  _saveCart(getCart().filter(item => item.id !== id));
}

export function updateQty(id, qty) {
  const cart = getCart();
  if (qty <= 0) {
    _saveCart(cart.filter(item => item.id !== id));
    return;
  }
  const item = cart.find(item => item.id === id);
  if (item) {
    item.qty = qty;
    _saveCart(cart);
  }
}

export function getCartUniqueCount() {
  return getCart().length;
}

export function getCartTotal() {
  return getCart().reduce((sum, item) => sum + item.priceVal * item.qty, 0);
}

export function clearCart() {
  const id = _getCurrentBranchId();
  if (!id) return;
  localStorage.removeItem(_cartKey(id));
}
