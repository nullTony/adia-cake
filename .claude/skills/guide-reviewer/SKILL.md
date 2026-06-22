---
name: "guide-reviewer"
description: "ADIA Cake code quality review checklist. Use this skill after completing any feature, bug fix, or change — before committing. Triggers when the user asks 'does everything work?', 'any issues?', 'is it accessible?', 'any memory leaks?', mentions adia-reviewer, or says 'review this'. Reads the changed files and produces a structured ✅/❌/⚠️ report. Does NOT edit code."
---

# ADIA Cake — Code Review Checklist

Read the changed files first, then work through each section. Output a structured report — never modify files.

---

## Pipeline Retry Logic

After completing the review report, always end with one of these:

### ✅ If no Critical or Warning issues:
```
## ✅ Approve — safe to commit
git add [files]
git commit -m "feat: [description]"
```

### 🔄 If Critical or Warning issues found:
```
## 🔄 Retry Required
Issue: [what's wrong, file:line]
Agent: [adia-designer | adia-developer]
Fix prompt: "[Exact corrective instruction]"
```

**Retry rules:**
- 🔴 Critical → always block and retry
- 🟡 Warning → retry if it breaks UX, accessibility (contrast < 4.5:1), or mobile layout; otherwise note in commit message
- Target only the agent that owns the broken layer: CSS/SCSS issues → adia-designer, JS issues → adia-developer, HTML structure → adia-developer
- After retry agent completes, re-review only the changed files

---

---

## Report Format

```
## Review: [feature name]

### ✅ Passed
- [what works]

### ❌ Failed
- [what's broken + why]

### ⚠️ Warnings
- [potential issues, not blockers]

### Recommendations
- [what to fix before committing]
```

---

## 1. Functionality

- Does the feature do what the prompt described?
- Does it work when the user is **logged out**? (no crash, graceful fallback)
- Does it work when **no branch is selected**? (branch selector should show if needed)
- Does it work for both **client** and **staff** users if relevant?
- Are **loading states** handled? (spinner or skeleton while data fetches)
- Are **empty states** handled? (no products, no orders, empty cart)
- Are **error states** handled? (Supabase failure, network timeout)

---

## 2. Performance & Memory Leaks

- Are `addEventListener` calls balanced with `removeEventListener` when the module re-initialises?
- Are `setInterval` / `setTimeout` values stored and cleared on cleanup?
- Does `initMyFeature()` guard against being called twice without cleanup?

```js
// Leak — adds new listener every time init runs
export function initFeature() {
  window.addEventListener('adia:branch-change', handler); // ❌

// Safe — removes before re-adding
let _handler = null;
export function initFeature() {
  if (_handler) window.removeEventListener('adia:branch-change', _handler);
  _handler = e => handleChange(e);
  window.addEventListener('adia:branch-change', _handler); // ✅
```

- Does any polling (`setInterval`) get stopped on logout? Check `notification-service.js` pattern.
- Are large arrays or DOM refs released after use?

---

## 3. Accessibility

**Touch targets:**
- All interactive elements (buttons, links, inputs) ≥ 44×44px
- On mobile, tap targets don't overlap

**Contrast:**
- Text on coloured backgrounds meets WCAG AA (4.5:1 for normal text, 3:1 for large)
- Check `--text-light` on `--bg-light` — this is the most common failure

**Focus states:**
- Every button/link/input has a visible `:focus` or `:focus-visible` style
- Focus order is logical (top→bottom, left→right)
- Modals trap focus when open; focus returns to trigger on close

**Semantic HTML:**
- Buttons use `<button>`, not `<div onclick>`
- Images have `alt` text or `alt=""` if decorative
- Form inputs have associated `<label>`

**ARIA:**
- Modals have `role="dialog"` and `aria-modal="true"`
- Dynamic content updates use `aria-live` if relevant

---

## 4. Mobile Responsiveness

Test at three breakpoints:

| Width | Scenario |
|-------|---------|
| 360px | Smallest Android — nothing overflows, text readable |
| 768px | Tablet — layout adapts (not just scaled desktop) |
| 1024px | Small laptop — grid columns correct |

Checks:
- No horizontal scroll at 360px
- Tap targets reachable with thumbs (bottom half of screen)
- Product grid: 2 columns on mobile, 3–4 on tablet, 4–5 on desktop
- Modal fills screen on mobile without overflow
- Cart/checkout usable on mobile keyboard (inputs don't get covered)
- Images use `object-fit: cover` and don't distort
- Text doesn't overflow card boundaries

---

## 5. RLS Security

- Does any **client-facing** code expose `staff_users` data? (passwords, roles, internal notes)
- Does any **API call** in a client module use admin-only table access?
- Is `getCurrentUser()` used to gate protected UI — not a raw localStorage read?
- Does any response get rendered as `innerHTML` with **unsanitized user input**? (XSS risk)
- Are Supabase credentials only in `js/config/api-config.js`? (not hardcoded elsewhere)
- Are `admin/` pages protected by `initRbac(page)` at the top?

```js
// ❌ XSS risk
el.innerHTML = `<span>${userInput}</span>`;

// ✅ Safe
el.textContent = userInput;
// or escape it first
el.innerHTML = `<span>${_esc(userInput)}</span>`;
```

---

## 6. Event System

- Are all custom events prefixed with `adia:` ?
- Do all `dispatchEvent` calls have matching `addEventListener` listeners?
- Are event listeners removed on cleanup (see Memory Leaks above)?
- Does `adia:auth-change` handler call `stopNotifications()` before starting new ones?

```js
// main.js and catalog-main.js pattern to verify
window.addEventListener('adia:auth-change', e => {
  stopNotifications();           // ✅ stop old
  stopToastNotifications();      // ✅ stop old
  const user = e.detail?.user;
  if (user?.type === 'client') {
    initClientNotifications(user.id); // ✅ start new
  }
});
```

- Does `adia:branch-change` trigger product re-render in `storefront.js` and `catalog.js`?

---

## 7. localStorage Synchronisation

- Are **store files** used instead of direct localStorage access?
  - `branch-store.js` for branch, `cart-store.js` for cart, `fav-store.js` for favorites
  - `auth-service.js → getCurrentUser()` for session — never `localStorage.getItem('adia_user_session')` directly
- Is cart correctly **scoped per branch**? (`adia_cart__{branchId}`)
- After branch switch: does cart badge update to reflect new branch's cart?
- After logout: is `adia_user_session` cleared? Does UI update immediately?
- Do favorites persist across page reload?

---

## 8. Telegram Notifications

If the change touches order flow or auth:

- **New order** → does staff Telegram receive notification?
- **Status change** (`confirmed`, `preparing`, `ready`, `completed`, `cancelled`) → does client receive toast + Telegram?
- **Partial confirmation** (`awaiting_client`) → does client receive notification with accept/decline?
- **Auth** → does Telegram bot send the confirm button on new session?

Check `js/api/telegram-api.js` is called at the right point, not skipped by a guard.

---

## 9. Order Lifecycle

If the change touches orders:

**Status flow** (all transitions should work):
```
new → confirmed / awaiting_client / cancelled
awaiting_client → confirmed / cancelled_by_client
confirmed → preparing / cancelled
preparing → ready
ready → completed
```

- Admin can set status via dropdown (only `ADMIN_STATUS_OPTIONS`: `new`, `confirmed`, `preparing`, `ready`, `completed`, `cancelled`)
- `awaiting_client` and `cancelled_by_client` are **system-only** — admin can't set these manually
- `order_items.item_status` values: `pending`, `confirmed`, `partial`, `unavailable`
- `total_confirmed_amount` updates correctly after partial confirmation
- Client sees correct status toast for each transition

---

## 10. Edge Cases

Work through these for the changed feature:

- **What if the Supabase call fails?** — is the error caught? Does UI show error state?
- **What if the user refreshes mid-flow?** — does session restore correctly?
- **What if branch is `null`?** — does the feature handle missing branch gracefully?
- **What if the cart is empty?** — does checkout/cart render correctly?
- **What if the product has no image?** — does the card show a placeholder?
- **What if the user taps a button twice quickly?** — is there a debounce or loading state to prevent double-submit?
- **What if `localStorage` is full or unavailable?** — do store files handle `try/catch`?

---

## 11. Code Patterns

Verify the new code follows project conventions:

- `const`/`let` only — no `var`
- Named exports only — no `export default`
- `.js` extension in all import paths
- Private functions prefixed with `_`
- Module has a single `init*` export called from entry point
- `async/await` — no `.then()` chains (except inline one-liners)
- Table names from `API_CONFIG` — not hardcoded strings
- No `console.log` left in — only `console.error` for real errors and `console.info` for `[supabase]` logs
- Comments only where logic is non-obvious — no "what" comments, no JSDoc

---

## 12. Git Commit Quality

Before committing, check:

- Is the commit message descriptive? ("`feat: Add branch-aware cart badge update on branch switch`" not "`fix stuff`")
- Does it describe **why**, not just what?
- Is it a single logical change? (not mixing unrelated edits)
- Are there any debug `console.log`, commented-out code, or `.bak` files staged?
- Is `styles/main.css` up to date if SCSS was changed? (run `sass styles/main.scss styles/main.css`)

**Commit only when:**
✅ Feature works end-to-end  
✅ No console errors  
✅ Mobile looks correct  
✅ No obvious accessibility failures  
✅ RLS not bypassed  
