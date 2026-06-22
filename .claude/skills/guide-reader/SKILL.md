---
name: "guide-reader"
description: "ADIA Cake codebase navigation guide. Use this skill whenever you need to locate code before editing — finding a CSS class, tracing a JS function, identifying which file to change, reading import chains, or answering 'where is X defined / which file handles Y'. Always use this skill before touching any file in the ADIA Cake project to avoid guessing paths."
---

# ADIA Cake — Code Navigation Guide

The goal is to find the right file and the right line before making any change. This prevents editing the wrong file and keeps diffs clean.

---

## Styles — Finding CSS

### Where SCSS lives

```
styles/
├── base/_variables.scss      ← design tokens (colors, spacing, fonts)
├── base/_reset.scss          ← global reset
├── layout/_header.scss       ← header shell
├── layout/_footer.scss
├── layout/_container.scss
├── layout/_mobile-menu.scss
├── layout/_mobile-nav.scss
├── components/_product-card.scss
├── components/_branch-selector.scss
├── components/_checkout.scss
├── components/_auth.scss
├── components/_quick-view.scss
├── components/_side-panels.scss
├── components/_buttons.scss
├── components/_orders.scss
├── components/_notifications.scss
├── components/_adia-toast.scss
├── components/_profile.scss
├── components/_category-card.scss
├── pages/_hero.scss
├── pages/_catalog.scss
├── pages/_catalog-page.scss
├── pages/_branches.scss
├── pages/_services.scss
├── pages/_cta.scss
├── pages/_reviews.scss
└── utilities/_animations.scss
```

Entry point: `styles/main.scss` — compiled to `styles/main.css` (never edit `.css` directly).

### Find a CSS class

```bash
# Find where .class-name is defined
grep -rn "\.class-name" styles/

# Find all uses of a CSS variable
grep -rn "\-\-color-primary" styles/

# Find what styles apply to an element id
grep -rn "#elementId" styles/
```

### Find a SCSS variable

```bash
grep -rn "variable-name" styles/base/_variables.scss
```

### Figure out which component file to edit

If the element is in a modal → look in `components/`  
If it's a page section → look in `pages/`  
If it's header/footer/nav → look in `layout/`

---

## JavaScript — Finding Functions and Modules

### Find where a function is defined

```bash
# Named function or exported function
grep -rn "function initCart\|initCart = \|export.*initCart" js/

# Arrow function assigned to const
grep -rn "const renderProductCard\|export.*renderProductCard" js/

# Method in an object/class
grep -rn "renderProductCard(" js/
```

### Find where a function is called

```bash
grep -rn "functionName(" js/
```

### Find which files import a module

```bash
# Who imports from cart.js?
grep -rn "from.*cart\|from.*cart\.js" js/

# Who imports a specific function?
grep -rn "import.*initCart" js/
```

### Find all exports from a file

Read the file and search for `export`:
```bash
grep -n "^export" js/modules/cart.js
```

Or read just the first 20 lines to see the module's public API (exports are usually at the top or bottom):
```
Read: js/modules/cart.js, offset=0, limit=20
```

### Find an event listener or dispatcher

```bash
# Who dispatches adia:branch-change?
grep -rn "adia:branch-change" js/

# Who listens to adia:auth-change?
grep -rn "addEventListener.*adia:auth-change" js/
```

### Find a localStorage key

```bash
grep -rn "localStorage\|adia_cart\|adia_branch\|adia_user_session\|adia_favorites" js/
```

---

## HTML — Finding Elements

### Find an element by ID

```bash
grep -rn "id=\"branchIndicator\"\|getElementById.*branchIndicator" .
```

### Find which HTML file a section belongs to

```bash
grep -rn "class=\"hero\"\|id=\"today\"\|class=\"catalog" index.html catalog.html admin/*.html
```

### Find where a JS module is loaded

```bash
grep -rn "main\.js\|catalog-main\.js\|dashboard\.js" index.html catalog.html admin/*.html
```

---

## Reading Files Efficiently

### Read only what you need

Instead of reading a whole file, use `offset` and `limit`:

```
# Read lines 50–100 of a file
Read: js/modules/cart.js, offset=50, limit=50

# Read just the top (imports + exports)
Read: js/modules/storefront.js, offset=0, limit=30
```

### Trace an import chain step by step

1. Start at the entry point for the page (`js/main.js` or `js/catalog-main.js`)
2. Grep for the function you're looking for:
   ```bash
   grep -rn "initStorefront" js/main.js
   ```
3. See which file it's imported from → open that file
4. Repeat until you reach the definition

### Understand a module at a glance

Read just the first 20–30 lines of any JS file — the imports tell you its dependencies, and the exports tell you its public API. You rarely need to read the whole file before you know which function to edit.

---

## Dependency Tracing

### Which files depend on a module?

```bash
# Who depends on branch-store.js?
grep -rn "branch-store" js/
```

### Which API does a UI module call?

Look at the imports at the top of the module file. Example for `storefront.js`:
```bash
grep -n "^import" js/modules/storefront.js
```
This immediately shows it uses `branch-products-api.js`, `product-card.js`, `cart.js`, `favorites.js`, `branch-store.js`.

### What Supabase table does an API file touch?

```bash
grep -n "TABLE\|ORDERS_TBL\|sbFetch" js/api/orders-api.js | head -20
```

---

## Common Navigation Recipes

### "I need to change how product cards look"
1. `grep -rn "product-card" styles/` → `styles/components/_product-card.scss`
2. `grep -rn "renderProductCard" js/` → `js/modules/product-card.js`

### "I need to change the branch selector modal"
1. Styles: `styles/components/_branch-selector.scss`
2. Logic: `js/modules/branch-selector.js`
3. State: `js/store/branch-store.js`

### "Where is the checkout order created?"
```bash
grep -rn "createOrder" js/
```
→ defined in `js/api/orders-api.js`, called from `js/modules/checkout.js`

### "Which file handles the cart badge counter?"
```bash
grep -rn "updateCartBadge\|badge\|cartCount" js/modules/cart.js | head -10
```

### "Where is a CSS variable defined?"
```bash
grep -rn "variable-name" styles/base/_variables.scss
```

### "Which admin page handles order status changes?"
```bash
grep -rn "updateOrderStatus" js/admin/
```
→ `js/admin/orders-list.js` and `js/admin/order-details.js`

---

## Quick Reference — Grep Patterns

| Goal | Command |
|------|---------|
| Find CSS class | `grep -rn "\.classname" styles/` |
| Find JS function def | `grep -rn "function name\|export.*name\|const name" js/` |
| Find function calls | `grep -rn "functionName(" js/` |
| Find who imports a file | `grep -rn "from.*filename" js/` |
| Find event listeners | `grep -rn "adia:event-name" js/` |
| Find localStorage key | `grep -rn "adia_keyname" js/` |
| Find HTML element | `grep -rn "id=\"name\"\|class=\"name\"" .` |
| Find Supabase table ref | `grep -rn "TABLE_NAME\|'/tablename" js/api/` |
| Find admin RBAC guard | `grep -rn "initRbac" js/admin/` |

---

## Rules for Reading

- **Never read `styles/main.css`** — it's generated. Read the source `.scss` files.
- **Read imports first** — the top 10–20 lines of any JS file tell you 80% of what you need to know.
- **Use line numbers** — always note the line where you found something so edits are precise.
- **Grep before Read** — run a grep to narrow down which file, then Read only that file.
- **Don't read `bot/`** — the Telegram bot is a separate Node.js process. Only touch it for bot-specific changes.
