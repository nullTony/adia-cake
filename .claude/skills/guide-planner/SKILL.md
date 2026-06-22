---
name: "guide-planner"
description: "Complete ADIA Cake codebase architecture reference. Use this skill whenever working on the ADIA Cake project — before editing any file, planning a feature, debugging a bug, or answering questions about: where a module lives, which file handles a feature, how the event system works, what's in a Supabase table, the order lifecycle, how modules communicate, localStorage keys, or any file path question. Always consult this skill before touching code in this project to avoid common mistakes."
---

# ADIA Cake — Full Architecture Reference

## Workflow Rules for adia-planner

**No stylistic questions.** When planning design tasks, never ask about:
- Hover effects, animation timing, transition easing
- Specific color shades within the ADIA palette
- Icon style (use Tabler for utility, custom SVG for header nav, emoji for content — per CLAUDE.md)
- Layout proportions (use CSS Grid with sensible defaults)
- Font sizes, spacing values (use existing SCSS variables)

Make these decisions autonomously based on the ADIA design system and existing conventions. Only ask about functional requirements that affect data model, business logic, or user permissions.

**Pipeline output:** Always end your plan with a `→ Handoff to adia-reader` section listing exact files to read and patterns to look for.

---

## Entry Points

| Page | HTML | JS Entry |
|------|------|----------|
| Homepage | `index.html` | `js/main.js` |
| Catalog | `catalog.html` | `js/catalog-main.js` |
| Admin dashboard | `admin/index.html` | `js/admin/dashboard.js` |
| Admin login | `admin/login.html` | `js/admin/auth.js` |
| Admin orders | `admin/orders.html` | `js/admin/orders-list.js` |
| Admin order detail | `admin/order-details.html` | `js/admin/order-details.js` |
| Admin products | `admin/products.html` | `js/admin/products-list.js` |
| Admin product form | `admin/product-form.html` | `js/admin/product-form.js` |
| Admin clients | `admin/clients.html` | `js/admin/clients-list.js` |
| Admin staff | `admin/staff.html` | `js/admin/staff-list.js` |
| Admin categories | `admin/categories.html` | `js/admin/categories-list.js` |
| Admin branch products | `admin/branch-products.html` | `js/admin/branch-products.js` |
| Admin Telegram bind | `admin/telegram-bind.html` | `js/admin/telegram-bind.js` |

---

## Module Map — Feature → File

### UI Modules (`js/modules/`)

| Feature | File | What it does |
|---------|------|--------------|
| Nav menu (desktop) | `js/modules/menu.js` | Header nav, active states |
| Mobile menu | `js/modules/mobile-menu.js` | Hamburger, slide drawer |
| Profile dropdown | `js/modules/profile-menu.js` | Login/logout button, user name |
| Cart drawer | `js/modules/cart.js` | Sidebar cart, badge count, `syncAddButtons()`, `syncWeightButtons()` |
| Favorites | `js/modules/favorites.js` | Heart buttons, `syncFavButtons()` |
| Checkout modal | `js/modules/checkout.js` | Order form, Supabase order creation |
| Branch selector modal | `js/modules/branch-selector.js` | Mandatory first-visit modal, branch switching |
| Branches section | `js/modules/branches.js` | Homepage branch cards |
| Homepage product sections | `js/modules/storefront.js` | Today showcase + Featured products |
| Catalog page | `js/modules/catalog.js` | Full catalog with category filter |
| Product card renderer | `js/modules/product-card.js` | `renderProductCard(product)` — shared renderer |
| Quick view modal | `js/modules/quick-view.js` | Product popup on card click |
| Featured carousel | `js/modules/featured-carousel.js` | Horizontal scroll for featured section |
| Testimonials carousel | `js/modules/tes-carousel.js` | Reviews slider |
| Scroll reveal | `js/modules/scroll-reveal.js` | Intersection Observer animations |
| Auth modal | `js/modules/auth-modal.js` | Phone + Telegram verification UI |
| Auth guard | `js/modules/auth-guard.js` | Redirect unauthenticated users |
| Phone input | `js/modules/phone-input.js` | International phone formatting (deprecated path — use `js/utils/phone-input.js`) |
| My orders | `js/modules/my-orders.js` | Client order history |

### Services (`js/services/`)

| Feature | File | What it does |
|---------|------|--------------|
| Auth lifecycle | `js/services/auth-service.js` | Session read/write, Telegram flow, staff login |
| Client notifications | `js/services/notification-service.js` | Real-time order status polling (15s) for clients AND admin |
| Manager notifications | `js/services/manager-notification-service.js` | Push notifications to managers |

### API Layer (`js/api/`)

| Resource | File | Key functions |
|----------|------|---------------|
| Base fetch | `js/api/supabase-client.js` | `sbFetch(path, options)` |
| Products | `js/api/products-api.js` | `getProducts()`, `getProductById(id)`, `createProduct()`, `updateProduct()`, `deleteProduct()` |
| Orders | `js/api/orders-api.js` | `getOrders()`, `createOrder()`, `updateOrderStatus()`, `updateOrderItem()`, `confirmPendingItems()` |
| Clients | `js/api/clients-api.js` | `getClientByPhone()`, `getClientById()`, `createClient()`, `updateClient()` |
| Staff | `js/api/staff-api.js` | `getStaffByPhoneWithPassword()`, `getStaffById()` |
| Branches | `js/api/branches-api.js` | `getBranches()`, `getBranchById()` |
| Branch products | `js/api/branch-products-api.js` | `getBranchProducts(branchId)` — returns products available at a branch |
| Categories | `js/api/categories-api.js` | `getCategories()` |
| Telegram | `js/api/telegram-api.js` | Notification sends to Telegram |
| Telegram verification | `js/api/tg-verification-api.js` | `createAuthSession()`, `getAuthSession()` |
| Image upload | `js/api/image-upload-api.js` | Supabase Storage upload |

### State Stores (`js/store/`)

| Store | File | localStorage key | Shape |
|-------|------|-----------------|-------|
| Branch | `js/store/branch-store.js` | `adia_branch` | `{ id, name, address }` |
| Cart | `js/store/cart-store.js` | `adia_cart__{branchId}` | `Item[]` — **per branch** |
| Favorites | `js/store/fav-store.js` | `adia_favorites` | `{ id, name, priceVal, priceStr, unit, img }[]` |

### Utils (`js/utils/`)

| Util | File |
|------|------|
| Date label | `js/utils/date.js` |
| Phone formatting | `js/utils/phone-input.js` |
| Weight formatting | `js/utils/weight.js` |

### Config

| File | Contents |
|------|----------|
| `js/config/api-config.js` | Supabase URL, anon key, table name constants — **all secrets live here** |

### Admin JS (`js/admin/`)

| File | What it does |
|------|--------------|
| `js/admin/auth.js` | Staff login session, logout |
| `js/admin/rbac.js` | Role checks — `initRbac(page)`, `getStaffSession()` |
| `js/admin/dashboard.js` | Admin home stats |
| `js/admin/orders-list.js` | Order cards, status filter tabs, partial confirmation |
| `js/admin/order-details.js` | Single order detail view |
| `js/admin/products-list.js` | Product table |
| `js/admin/product-form.js` | Create/edit product |
| `js/admin/clients-list.js` | Client table |
| `js/admin/staff-list.js` | Staff management |
| `js/admin/categories-list.js` | Category management |
| `js/admin/branch-products.js` | Branch ↔ product inventory |
| `js/admin/telegram-bind.js` | Bind staff Telegram accounts |

### Notifications (`js/notifications.js`)

Standalone file (not in `modules/`) — rich toast notifications for clients. Polls orders every 15s, shows toasts for status changes. Keys: `adia_notif_check`, `adia_pending_toasts`.

---

## Event System

All events use `window.dispatchEvent` / `window.addEventListener`.

### `adia:auth-change`
**Fired by:** `js/services/auth-service.js` → `_emitAuthChange()`  
**When:** On page load (after session restore), login, logout  
**Detail:** `{ user }` — user is the full client/staff object or `null`

```js
window.addEventListener('adia:auth-change', e => {
  const user = e.detail?.user;
  if (user?.type === 'client') { /* logged in as client */ }
  if (user?.type === 'staff')  { /* logged in as staff  */ }
  if (!user)                   { /* logged out           */ }
});
```

**Who listens:** `main.js`, `catalog-main.js` — to start/stop client notifications; `profile-menu.js`, `cart.js`, `favorites.js`

### `adia:branch-change`
**Fired by:** `js/store/branch-store.js` → `setSelectedBranch(branch)`  
**When:** User selects or changes branch  
**Detail:** `{ branch }` — branch is `{ id, name, address }` or `null`

```js
window.addEventListener('adia:branch-change', e => {
  const branch = e.detail?.branch;
  // branch?.id is the new branch ID, or null if cleared
});
```

**Who listens:** `storefront.js`, `catalog.js` — re-render products; `cart.js` — switch cart

---

## localStorage Keys

| Key | Owner | Contents |
|-----|-------|----------|
| `adia_user_session` | `auth-service.js` | `{ clientId, type:'client' }` or `{ staffId, type:'staff' }` |
| `adia_branch` | `branch-store.js` | `{ id, name, address }` |
| `adia_cart__{branchId}` | `cart-store.js` | Cart items array (one key per branch) |
| `adia_favorites` | `fav-store.js` | Favorite items array |
| `adia_notif_check` | `notifications.js` | Timestamp of last notification poll |
| `adia_pending_toasts` | `notifications.js` | Queued toasts when tab was hidden |

> **Important:** `adia_user_session` is the real key. CLAUDE.md references `adia_client`/`adia_staff` which are outdated.

---

## Supabase Tables

### `products`
```
id, title, description, price, category, photo,
in_stock (bool), is_today_showcase (bool), is_popular (bool),
sort_order, unit_type, weight_step, min_weight, max_weight,
created_at, updated_at
```
**Frontend camelCase:** `inStock`, `isTodayShowcase`, `isPopular`, `sortOrder`, `unitType`, `weightStep`, `minWeight`, `maxWeight`

### `orders`
```
id, order_number, user_id, customer_name, phone,
delivery_type ('delivery'|'pickup'),
delivery_address, branch_id, branch_name,
comment, status, cancel_reason,
total_requested_amount, total_confirmed_amount,
created_at, updated_at
```

### `order_items`
```
id, order_id, product_id,
product_title_snapshot, product_price_snapshot,
requested_qty, confirmed_qty,
item_status ('pending'|'confirmed'|'partial'|'unavailable'),
admin_comment, weight_grams
```

### `clients`
```
id, full_name, phone, telegram_chat_id, telegram_username,
is_verified, created_at
```

### `staff_users`
```
id, full_name, phone, password (plain text), role ('owner'|'admin'|'manager'),
is_active, telegram_chat_id, created_at
```

### `branches`
```
id, name, address, phone, working_hours, is_active, sort_order
```

### `categories`
```
id, name, slug, sort_order, is_active
```

### `branch_products`
```
id, branch_id, product_id,
is_available_today (bool), stock_note, sort_order
```
Used by `storefront.js` (today showcase) and `catalog.js` (full catalog filtered by branch).

### `auth_sessions`
```
id, phone, status ('pending'|'confirmed'|'cancelled'|'expired'),
telegram_chat_id, created_at, expires_at
```
Temporary — expires after 10 min.

---

## Order Lifecycle

```
new
 └─→ confirmed         (admin confirms all items)
 └─→ awaiting_client   (admin made partial changes — client must approve)
       └─→ confirmed   (client accepts changes)
       └─→ cancelled_by_client (client rejects)
 └─→ cancelled         (admin cancels)

confirmed
 └─→ preparing
 └─→ cancelled

preparing
 └─→ ready

ready
 └─→ completed
```

**Order item statuses:** `pending` → `confirmed` / `partial` / `unavailable`

**Admin rule:** `confirmed_qty` inputs default to `requested_qty`. Admin edits only unavailable items. Never auto-blocks purchases.

**Toast statuses shown to client:** `confirmed`, `awaiting_client`, `preparing`, `ready`, `completed`, `cancelled`

---

## Auth Flows

### Client (Telegram)
1. `auth-modal.js` calls `checkPhone(phone)` → returns `{ role: 'admin' | 'client' | 'new' }`
2. `startAuth(phone)` → creates `auth_sessions` row → returns `{ sessionId, isReturning }`
3. Bot detects pending session → sends confirm button to Telegram
4. `pollAuthSession(sessionId, signal)` → polls every 2s for up to 10 min
5. On `'confirmed'`: `finalizeClientLogin(phone, name, sessionId)` → saves `{ clientId, type:'client' }` to `adia_user_session`
6. `_emitAuthChange()` fires `adia:auth-change`

### Staff
1. Phone + password form in `admin/login.html`
2. `verifyAdminPassword(phone, password)` → lookup + compare
3. Saves `{ staffId, type:'staff' }` to `adia_user_session`

---

## API Pattern — `sbFetch`

```js
// All responses are arrays
const products = await sbFetch('/products?order=sort_order.asc');

// Single row — always use [0]
const product = await sbFetch(`/products?id=eq.${id}`).then(r => r[0]);

// POST (create)
const [created] = await sbFetch('/orders', {
  method: 'POST',
  body: JSON.stringify(payload),
  headers: { 'Prefer': 'return=representation' },
});

// PATCH (update)
await sbFetch(`/orders?id=eq.${id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'confirmed' }),
});
```

Base URL + tables are defined in `js/config/api-config.js`. Never hardcode them elsewhere.

---

## Module Communication Patterns

### Pattern 1: Event-driven (loosely coupled)
Used for branch/auth state:
```js
// Producer
window.dispatchEvent(new CustomEvent('adia:branch-change', { detail: { branch } }));

// Consumer (any module)
window.addEventListener('adia:branch-change', e => { /* react */ });
```

### Pattern 2: Store-read (direct)
Used when a module needs current state synchronously:
```js
import { getSelectedBranch } from '../store/branch-store.js';
import { getCart } from '../store/cart-store.js';
import { getCurrentUser } from '../services/auth-service.js';
```

### Pattern 3: Direct import (UI helpers)
Used within the same feature domain:
```js
import { syncAddButtons } from './cart.js';        // updates add-to-cart button states
import { syncFavButtons } from './favorites.js';    // updates heart button states
import { renderProductCard } from './product-card.js'; // shared card HTML
```

### Pattern 4: Admin RBAC
Every admin page calls this first:
```js
import { initRbac } from './rbac.js';
initRbac('orders'); // checks role, redirects if unauthorized
```

---

## Code Rules

- **Vanilla JS only** — no frameworks, no jQuery, no React
- **ES6 modules** — `import`/`export`, no CommonJS
- **`const`/`let` only** — never `var`
- **`async`/`await`** — no `.then()` chains except for inline one-liners
- **No secrets in code** — all in `js/config/api-config.js`
- **Each module has an `init*` function** — called from entry point
- **Comments only where logic is non-obvious** — no JSDoc, no "what" comments
- **RLS compatibility** — never expose admin-only data in client context
- **Supabase returns arrays** — always handle as arrays, use `[0]` for single row

---

## Common Pitfalls

1. **Wrong localStorage key** — use `adia_user_session`, not `adia_client` or `adia_staff`
2. **Forgot cart is per-branch** — key is `adia_cart__{branchId}`, not `adia_cart`
3. **Supabase returns array** — `sbFetch('/products?id=eq.1')` returns `[product]`, not `product`
4. **Branch change doesn't re-render** — consumer must listen to `adia:branch-change`
5. **Auth state not checked** — always use `getCurrentUser()` from `auth-service.js`, never read `adia_user_session` directly
6. **Admin page without RBAC** — every admin JS must call `initRbac(page)` before anything else
7. **Event name typo** — events are `adia:auth-change` and `adia:branch-change` (hyphen, not underscore)
8. **Wrong init order** — `initBranchSelector()` must be called before `initStorefront()` / `initCatalog()` on pages that have both
9. **Missing `Prefer: return=representation` header** — required on POST to get the created row back from Supabase
10. **`order_items.item_status`** — there are 4 values: `pending`, `confirmed`, `partial`, `unavailable`. `order.status` is separate and different.
