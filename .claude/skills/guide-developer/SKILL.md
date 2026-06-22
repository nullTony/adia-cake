---
name: "guide-developer"
description: "JavaScript coding patterns for the ADIA Cake project. Use this skill whenever writing, extending, or modifying any JS file in the project — creating a new module, adding an event listener, calling Supabase, working with localStorage, wiring up DOM, or implementing module communication. Always use this skill when the user asks 'how do I write X in ADIA Cake', mentions adia-developer, or starts implementing a JS feature so the code matches the existing architecture."
---

# ADIA Cake — JavaScript Patterns

The codebase is Vanilla JS with ES6 modules. Every pattern here is drawn directly from existing code — follow these to keep new code consistent and maintainable.

---

## Module Structure

Every feature lives in its own file with a single `init*` export. The entry point (`main.js` or `catalog-main.js`) calls all `init` functions on `DOMContentLoaded`.

```js
// js/modules/my-feature.js

import { getSelectedBranch } from '../store/branch-store.js';
import { sbFetch }           from '../api/supabase-client.js';

// Module-level state (private — not exported)
let _state = null;

// Single public init function
export function initMyFeature() {
  _loadData();
  _bindEvents();
}

// Private functions — underscore prefix
function _loadData() { /* ... */ }
function _bindEvents() { /* ... */ }
```

Then in the entry point:
```js
// js/main.js
import { initMyFeature } from './modules/my-feature.js';

document.addEventListener('DOMContentLoaded', () => {
  initMyFeature();
});
```

---

## ES6 Imports / Exports

```js
// Named export (preferred — allows tree-shaking)
export function initCart() { /* ... */ }
export function updateCartBadge() { /* ... */ }

// Named import
import { initCart, updateCartBadge } from './modules/cart.js';

// Relative paths — always use .js extension
import { sbFetch }      from '../api/supabase-client.js';
import { API_CONFIG }   from '../config/api-config.js';
import { getSelectedBranch } from '../store/branch-store.js';
```

Rules:
- Never use default exports — always named
- Always include `.js` extension in import paths
- Use `../` to go up a directory, `./` for same directory
- Group imports: external libs → api → services → stores → utils

---

## Variables and Naming

```js
// Module-level private state — underscore prefix
let _currentUser  = null;
let _branches     = [];
let _canClose     = false;

// Constants — SCREAMING_SNAKE for config, camelCase for derived values
const SESSION_KEY = 'adia_user_session';
const POLL_MS     = 15_000;

// Never use var
// Use const for everything that won't be reassigned
// Use let only when you need to reassign

// Function naming — verbs + nouns
function initCart() {}          // module init
function renderProductCard() {} // UI rendering
function updateCartBadge() {}   // UI update
function syncAddButtons() {}    // sync state → DOM
function _loadBranches() {}     // private fetch
function _bindEvents() {}       // private event setup
function _emitAuthChange() {}   // private event dispatch
```

---

## Event System

All cross-module communication uses custom events on `window` with the `adia:` prefix.

### Dispatching an event

```js
// Simple dispatch
window.dispatchEvent(new CustomEvent('adia:branch-change', {
  detail: { branch: { id, name, address } },
}));

// Auth change (null detail when logged out)
window.dispatchEvent(new CustomEvent('adia:auth-change', {
  detail: { user: _currentUser },
}));
```

### Listening to an event

```js
// Persistent listener — stays for the lifetime of the page
window.addEventListener('adia:branch-change', e => {
  const branch = e.detail?.branch;
  if (branch?.id) {
    _renderProducts(branch.id);
  }
});

// One-time listener
window.addEventListener('adia:auth-change', handleAuth, { once: true });
```

### Existing events

| Event | Detail shape | Who fires it |
|-------|-------------|--------------|
| `adia:auth-change` | `{ user }` — user object or null | `auth-service.js` |
| `adia:branch-change` | `{ branch }` — `{ id, name, address }` or null | `branch-store.js` |

When adding new events, follow the `adia:noun-verb` pattern (e.g., `adia:cart-update`, `adia:order-complete`).

### Avoiding memory leaks

If you add a listener inside an `init` function that runs multiple times (e.g., re-renders), store and remove it first:

```js
let _branchHandler = null;

export function initMyFeature() {
  // Remove previous listener before adding new one
  if (_branchHandler) {
    window.removeEventListener('adia:branch-change', _branchHandler);
  }
  _branchHandler = e => _onBranchChange(e.detail?.branch);
  window.addEventListener('adia:branch-change', _branchHandler);
}
```

---

## Supabase API Calls

All API calls go through `sbFetch` in `js/api/supabase-client.js`. Never use raw `fetch` for Supabase.

```js
import { sbFetch } from '../api/supabase-client.js';

// GET — returns array always
const products = await sbFetch('/products?order=sort_order.asc');

// GET single row — use [0]
const product = await sbFetch(`/products?id=eq.${id}`).then(r => r[0]);

// GET with filters
const items = await sbFetch(`/order_items?order_id=eq.${orderId}`);

// POST — returns created row with Prefer header
const [created] = await sbFetch('/orders', {
  method:  'POST',
  body:    JSON.stringify(payload),
  headers: { 'Prefer': 'return=representation' },
});

// PATCH — update
await sbFetch(`/orders?id=eq.${id}`, {
  method: 'PATCH',
  body:   JSON.stringify({ status: 'confirmed' }),
});

// DELETE
await sbFetch(`/auth_sessions?id=eq.${id}`, { method: 'DELETE' });
```

**Always** get table names from `API_CONFIG`, never hardcode strings:
```js
import { API_CONFIG } from '../config/api-config.js';
const TABLE = API_CONFIG.SUPABASE.TABLES.PRODUCTS;
const rows  = await sbFetch(`/${TABLE}?order=sort_order.asc`);
```

### Normalization pattern

Supabase returns `snake_case`. Convert to `camelCase` in the API file:

```js
function fromProduct(row) {
  return {
    id:       row.id,
    title:    row.title     || '',
    inStock:  row.in_stock  ?? true,
    sortOrder: Number(row.sort_order) || 0,
  };
}

export async function getProducts() {
  const rows = await sbFetch(`/${TABLE}?order=sort_order.asc`);
  return rows.map(fromProduct);
}
```

And convert back when writing:
```js
function toProduct(p) {
  return {
    title:      p.title,
    in_stock:   p.inStock,
    sort_order: p.sortOrder,
  };
}
```

---

## localStorage (Stores)

Use the store files — never read/write localStorage directly in modules.

```js
// Reading state
import { getSelectedBranch, setSelectedBranch } from '../store/branch-store.js';
import { getCart, addToCart, clearCart }         from '../store/cart-store.js';
import { getFavorites, toggleFavorite }          from '../store/fav-store.js';
import { getCurrentUser }                        from '../services/auth-service.js';

const branch = getSelectedBranch(); // { id, name, address } or null
const cart   = getCart();           // Item[] for current branch
const user   = getCurrentUser();    // user object or null
```

If you need a new persistent value, create a new store file following this pattern:

```js
// js/store/my-store.js
const KEY = 'adia_my_value';

export function getMyValue() {
  try { return JSON.parse(localStorage.getItem(KEY)); }
  catch { return null; }
}

export function setMyValue(val) {
  if (val != null) {
    localStorage.setItem(KEY, JSON.stringify(val));
  } else {
    localStorage.removeItem(KEY);
  }
}
```

localStorage key naming: always prefix with `adia_`.

---

## DOM Manipulation

```js
// Prefer querySelector over getElementById for flexibility
const grid   = document.querySelector('.products-grid');
const badge  = document.getElementById('cartBadge'); // OK for IDs

// Guard against missing elements — page may not have this section
if (!grid) return;

// Set text content (safe from XSS)
el.textContent = product.title;

// Set HTML — only when you control the content or have escaped it
el.innerHTML = `<span class="price">${_esc(price)}</span>`;

// Escape user-provided strings before inserting as HTML
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Toggle classes
el.classList.add('is-loading');
el.classList.remove('is-loading');
el.classList.toggle('is-open');

// Delegate events on dynamic lists (better than adding per-item)
document.addEventListener('click', e => {
  const btn = e.target.closest('.add-to-cart-btn');
  if (!btn) return;
  const id = btn.dataset.productId;
  addToCart(id);
});
```

---

## Module Communication Patterns

### Pattern 1 — Event (for global state changes)
Use when: any number of modules might care about the change.
```js
// Sender
import { setSelectedBranch } from '../store/branch-store.js';
setSelectedBranch(branch); // fires adia:branch-change automatically

// Receiver (any module)
window.addEventListener('adia:branch-change', e => { /* react */ });
```

### Pattern 2 — Direct import (for UI sync)
Use when: one module needs to update another module's DOM state.
```js
import { syncAddButtons }  from './cart.js';
import { syncFavButtons }  from './favorites.js';

// After rendering product cards, sync button states
syncAddButtons();
syncFavButtons();
```

### Pattern 3 — Store read (for current value)
Use when: a module needs current state once, synchronously.
```js
import { getSelectedBranch }  from '../store/branch-store.js';
import { getCurrentUser }     from '../services/auth-service.js';

const branch = getSelectedBranch();
if (!branch?.id) return; // no branch selected yet
```

---

## Auth and RLS Safety

```js
import { getCurrentUser, isAuthenticated, isAdmin } from '../services/auth-service.js';

// Check before showing protected UI
const user = getCurrentUser();
if (!user) {
  showLoginPrompt();
  return;
}

// Client vs staff
if (user.type === 'client') { /* show client UI */ }
if (user.type === 'staff')  { /* show admin UI */ }

// Never read localStorage['adia_user_session'] directly — use getCurrentUser()
// Never expose staff_users data in client-facing code
// Never pass admin API keys or table names to client-rendered HTML
```

Admin pages must call `initRbac` before anything else:
```js
// js/admin/my-admin-page.js
import { initRbac } from './rbac.js';
initRbac('my-page'); // redirects if role insufficient
```

---

## Async / Await

```js
// Always async/await — no .then() chains except for inline one-liners
export async function initMyFeature() {
  try {
    const data = await _fetchData();
    _render(data);
  } catch (err) {
    console.error('[my-feature] load failed:', err);
    _showError();
  }
}

// Inline .then() is fine for simple transforms
const product = await sbFetch(`/products?id=eq.${id}`).then(r => r[0]);

// Parallel requests
const [products, branches] = await Promise.all([
  getProducts(),
  getBranches(),
]);
```

---

## Naming Conventions Summary

| Thing | Convention | Example |
|-------|-----------|---------|
| Module init | `init` + PascalCase | `initCart`, `initBranchSelector` |
| Private functions | `_` prefix | `_renderCards`, `_bindEvents` |
| Private event emit | `_emit` + EventName | `_emitAuthChange` |
| DOM render | `render` + What | `renderProductCard` |
| DOM sync | `sync` + What | `syncAddButtons`, `syncFavButtons` |
| Store getter | `get` + What | `getCart`, `getSelectedBranch` |
| Store setter | `set` + What | `setSelectedBranch` |
| API getter | `get` + Resource | `getProducts`, `getOrderById` |
| API create | `create` + Resource | `createOrder`, `createClient` |
| API update | `update` + Resource | `updateOrderStatus` |
| Event names | `adia:` + noun-verb | `adia:branch-change`, `adia:auth-change` |
| localStorage keys | `adia_` + name | `adia_branch`, `adia_favorites` |
| Private state | `_` + camelCase | `_branches`, `_currentUser` |
| Config constants | SCREAMING_SNAKE | `SESSION_KEY`, `POLL_MS` |
