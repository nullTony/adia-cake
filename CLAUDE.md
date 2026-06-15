# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Quick Start

**Dev Server** (Frontend @ 127.0.0.1:5500)
```bash
# Install Live Server globally (one-time)
npm install -g live-server

# Run in project root
live-server
```

**Telegram Bot** (Node.js)
```bash
cd bot
npm install
node bot.js
```

---

## Architecture

### Three-Tier Stack
- **Frontend:** Vanilla HTML/CSS/JS (no frameworks) with modular ES6 imports
- **Backend:** Supabase (PostgreSQL) with RLS policies + PostgREST API
- **Bot:** Node.js + node-telegram-bot-api for notifications & Telegram auth

### Frontend Module Structure
```
js/
├── main.js                    # Entry point (index.html)
├── catalog-main.js            # Entry point (catalog.html)
├── modules/                   # UI features (each has init*)
│   ├── cart.js
│   ├── checkout.js
│   ├── auth-modal.js          # Phone + verification code UI
│   ├── quick-view.js
│   ├── favorites.js
│   ├── branch-selector.js     # Modal to pick pickup branch
│   ├── storefront.js          # Renders products in catalog
│   └── ...
├── services/
│   ├── auth-service.js        # Session lifecycle + Telegram flow
│   ├── notification-service.js # Real-time order status for clients
│   └── manager-notification-service.js # Admin notifications
├── api/                       # Supabase + Telegram REST
│   ├── supabase-client.js     # Base fetch wrapper
│   ├── products-api.js
│   ├── orders-api.js
│   ├── clients-api.js
│   ├── telegram-api.js        # Notification sends
│   ├── tg-verification-api.js
│   └── ...
├── store/                     # Client-side state
│   ├── cart-store.js
│   ├── fav-store.js
│   └── branch-store.js
└── utils/
    └── phone-input.js         # Intl phone formatting
```

### Admin Module Structure
```
admin/
├── login.html / index.html    # Protected pages
├── orders.html, products.html, etc.
js/admin/
├── auth.js                    # Staff login session
├── rbac.js                    # Role checks (owner/admin/manager)
├── dashboard.js               # Admin entry point
├── orders-list.js, product-form.js, etc.
```

---

## Authentication & Authorization

### Client (Telegram) Auth Flow
1. User enters phone → `tg-verification-api.js` creates `auth_sessions` row (status: pending)
2. **Returning user (known telegram_chat_id):** Bot polls → sends confirm button
3. **New user:** Opens bot → `/start` → bot requests contact share → matches phone → sends button
4. User taps ✅/❌ → Bot updates `auth_sessions` → Site polls → detects confirmed → logs in
5. Session stored in `localStorage['adia_client']` as `{ id, full_name, phone, telegram_chat_id, ... }`

**Key:** Code is sent **only** if Telegram account phone matches entered phone.

### Staff Auth
- Phone + password login in `admin/login.html`
- Session in `localStorage['adia_staff']`
- `rbac.js` enforces role (owner / admin / manager)

### Supabase RLS
All tables have RLS policies:
- `clients` → auth via `auth_sessions`
- `orders` → visible to own orders (client) or by role (staff)
- `products`, `branches` → public read
- Admin tables → role-based (owner/admin)

---

## Key Concepts

### Event System
Modules communicate via custom DOM events (adia: prefix):
```js
// Branch changed
window.dispatchEvent(new CustomEvent('adia:branch-change', { detail: branchId }));
window.addEventListener('adia:branch-change', handleChange);

// Auth state changed
window.dispatchEvent(new CustomEvent('adia:auth-change', { detail: { user, type } }));

// Cart updated
window.dispatchEvent(new CustomEvent('adia:cart-change', { detail: items }));
```

### Order Lifecycle
**Statuses:** `new → confirmed → preparing → ready → completed / cancelled`

**Partial Confirmation:** Admin can reduce `confirmed_quantity` per item:
- Item status becomes `partial` or `unavailable`
- Customer gets Telegram notification → must Accept or Cancel
- Never auto-block purchases (bakery manually confirms availability)

**Admin UX Rule:** `confirmed_quantity` inputs default to `requested_quantity`. Admin only edits items that are unavailable.

### API Response Pattern
All Supabase calls return arrays. Single-row queries are `[0]`:
```js
const products = await sbFetch('/products?order=sort_order.asc');
const product = await sbFetch(`/products?id=eq.${id}`).then(r => r[0]);
```

---

## File Organization Rules

- **Vanilla JS only** (no frameworks unless explicitly asked)
- **Preserve RLS compatibility** (never expose admin-only data to clients)
- **No secrets in code** → all in `js/config/api-config.js`
- **Modular structure** → each feature has init function + event listeners
- **No MockAPI** (fully removed — Supabase only)
- **Match existing code style** (modern ES6, no var, const/let)
- **Comments only where non-obvious** (hidden constraints, workarounds, invariants — not what the code does)

---

## Supabase Tables Reference

| Table | Role Access | Notes |
|-------|-------------|-------|
| `clients` | Self (via phone) | Telegram user data |
| `staff_users` | Admins | Hashed passwords, role-based |
| `products` | Public read | Catalog items, sort_order controls display order |
| `categories` | Public read | Product categories |
| `branches` | Public read | 4 physical locations (Tashkent) |
| `branch_products` | Public read | Inventory links |
| `orders` | Client/staff RLS | Status flow: new → confirmed → preparing → ready → completed |
| `order_items` | Via orders | Per-item quantities + confirmation status |
| `auth_sessions` | Temporary | Telegram verification (expires after 10 min) |
| `telegram_verifications` | Temporary | Phone + code (deprecated, kept for reference) |

---

## Telegram Bot (bot/bot.js)

**Responsibilities:**
- Listen for `/start` from new users → request contact share
- Match phone number → send verification confirmation button
- Monitor `auth_sessions` for pending confirmations
- Send order notifications (new order to staff, status to client)
- Cancel/accept partial order confirmations

**Note:** Bot token, Supabase URL, and API key are hardcoded in `bot/bot.js`. For production, move to environment variables.

**Common Issue:** `409 Conflict` means another bot instance is running. Kill with: `pkill -f "node bot.js"`

---

## Styling Architecture

```
styles/
├── main.scss       # Compiled from components + layout + pages
├── base/
│   ├── _variables.scss  # Colors, spacing, typography
│   └── _reset.scss
├── layout/         # Header, footer, nav, container
├── components/     # Reusable UI (buttons, cards, modals)
├── pages/          # Page-specific (hero, catalog, branches)
└── utilities/      # Animations
```

Compiled to `main.css` and `admin.css`. Use SCSS variables for consistency.

---

## Session & Storage

**Client Session** (`localStorage['adia_client']`)
```js
{ id, full_name, phone, telegram_chat_id, telegram_username, is_verified, created_at }
```

**Staff Session** (`localStorage['adia_staff']`)
```js
{ id, full_name, phone, role: 'owner'|'admin'|'manager', is_active }
```

**Preference Stores** (localStorage):
- `adia_cart` → order items
- `adia_favorites` → liked products
- `adia_selected_branch` → pickup location

---

## Debugging Tips

- **Supabase logs:** Check browser console for `[supabase]` messages (all REST calls are logged)
- **Auth flow stalled:** Check `auth_sessions` table for pending/expired rows
- **Bot not responding:** Check `node bot.js` console for errors; kill duplicates
- **RLS blocking requests:** Look for `401 Unauthorized` — usually means missing or stale session
- **Cart/favorites not persisting:** Verify localStorage keys match `*-store.js` assumptions

---

## Working Features ✅

- Products, categories, branches from Supabase (dynamic catalog)
- Admin orders panel (status updates, partial confirmation, cancellation)
- Order creation + checkout modal
- Telegram bot + notifications (both client and staff)
- Customer & staff sections in admin
- Supabase RLS policies protecting sensitive data
- Branch selector (pickup location choice)
- Cart + favorites (localStorage-backed)
- Phone input with international formatting
