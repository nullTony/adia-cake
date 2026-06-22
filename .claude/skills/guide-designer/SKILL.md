---
name: "guide-designer"
description: "ADIA Cake design system reference — CSS variables, colors, typography, spacing, breakpoints, SCSS file structure, accessibility rules, hover/focus patterns, and premium bakery aesthetic. Use this skill whenever working on any CSS/SCSS in the ADIA Cake project: choosing a color, setting spacing, writing a media query, adding a new component, checking contrast, or answering 'which variable should I use?'. Always load this skill before writing or reviewing SCSS for this project."
---

# ADIA Cake — Design System Reference

## Design Tokens (CSS Custom Properties)

All tokens live in `styles/base/_variables.scss` and are declared on `:root`.  
**Never hardcode hex values** — always use the variable. This keeps the palette consistent and makes future changes easy.

### Color Palette

```scss
// Warm backgrounds — page surfaces, section fills
--milk:         #FEFCF8   // body background, primary page surface
--cream:        #FFF8F0   // section backgrounds (hero, catalog hero)
--beige:        #F5E6D3   // hover states, tags, chips, section headers
--beige-dark:   #EDD5BC   // gradient end, deeper hover

// Caramel — primary accent (warm gold)
--caramel:      #E8C99A   // active states, badges, chip backgrounds
--caramel-dark: #D4A574   // active hover, focus outline color

// Coffee — secondary accent (warm brown)
--coffee:       #C4956A   // labels, tags, icon tint, link color
--coffee-dark:  #A67C52   // button hover (dark bg), heading accents

// Powder — pink accent (hearts, favorites, highlights)
--powder:        #E8B4B8  // cart badge, .badge-new
--powder-light:  #F7E0E2  // favorite button hover/active bg
--powder-active: #e8506a  // favorite icon fill when active

// Semantic
--green:  #10B981   // success states (.pc-add.added, order ready)
--star:   #F59E0B   // star ratings
```

### Text Colors

```scss
--text-dark:  #2C1810   // headings, primary body text, dark buttons
--text-med:   #6B4C3B   // nav links, secondary body text, descriptions
--text-light: #7A5C4B   // product descriptions, secondary labels
--text-muted: #8B6F5F   // placeholders, metadata, timestamps
--white:      #FFFFFF
--border:     rgba(196, 149, 106, 0.2)  // dividers, card borders, input borders
```

**Contrast guidance (WCAG AA):**
- `--text-dark` on `--milk`/`--cream`/`--white` → ✅ passes AA (ratio ~10:1)
- `--text-med` on `--milk` → ✅ passes AA (ratio ~4.8:1)
- `--text-light` on `--white` → ✅ passes AA (ratio ~4.5:1)
- `--text-muted` on `--white` → ⚠️ borderline — don't use for body text, only decorative/secondary labels
- `--caramel` on `--white` → ❌ fails — never use caramel as text on light backgrounds
- `--coffee-dark` on `--white` → ✅ passes AA — safe for text

### Shadows

```scss
--shadow-s: 0 4px 20px rgba(44, 24, 16, 0.07)   // cards at rest, badges
--shadow-m: 0 8px 32px rgba(44, 24, 16, 0.11)   // hovered cards, floating panels
--shadow-l: 0 16px 48px rgba(44, 24, 16, 0.15)  // hero image, modals
```

### Border Radii

```scss
--r-sm: 12px   // buttons (small), input fields, filter chips, tags
--r-md: 16px   // cards (inner), modals, menu items
--r-lg: 24px   // product cards, sidebar panels, hero image wrapper
--r-xl: 32px   // hero main image
// 50% / 100px  → circles and pill buttons (btn, h-icon-btn, badges)
```

### Transitions & Layout

```scss
--ease:  0.3s cubic-bezier(0.4, 0, 0.2, 1)  // all hover/focus transitions
--max-w: 1240px                               // max container width
```

---

## Typography

### Font Families

| Role | Font | Usage |
|------|------|-------|
| **Display / Headings** | `'Cormorant Garamond', serif` | h1, h2, h3, section titles, product names, logo |
| **Body / UI** | `'Nunito', sans-serif` | body, buttons, labels, nav, inputs, all UI text |

Both are loaded via Google Fonts. Never introduce a third font.

### Type Scale

```scss
// Display (Cormorant Garamond)
.hero-h1     → clamp(40px, 6.5vw, 76px), weight 600
.sec-title   → clamp(30px, 5vw, 52px),   weight 600
.catalog-title → clamp(32px, 5vw, 52px), weight 700

// Component headings (Cormorant Garamond)
.pc-name         → 20px, weight 600
.cat-filter-title → 20px, weight 700
.logo-name       → 22px, weight 600

// Body / UI (Nunito)
.hero-p     → 17px, line-height 1.75
.sec-sub    → 16px, line-height 1.75
body        → 14–15px, line-height 1.6
.pc-desc    → 13px, line-height 1.55
labels/meta → 12–13px

// Buttons (Nunito)
.btn        → 15px, weight 700
.btn-lg     → 16px, weight 700
.btn-sm     → 13px, weight 700
```

### Typography patterns
- Headings use **Cormorant Garamond** — the premium serif gives the bakery character
- All UI chrome (buttons, labels, inputs, nav) uses **Nunito** for warmth and readability
- Section tags / category labels: `12px, weight 700, letter-spacing: 0.15em, text-transform: uppercase`
- `em` inside hero headlines renders in italic + `--coffee-dark` for editorial emphasis

---

## Spacing Scale

ADIA uses an **8px base grid** with a 4px micro-step. Common values:

| Token | Value | Use |
|-------|-------|-----|
| 4px   | micro  | badge padding, tight gaps |
| 8px   | xs     | icon-text gap, badge padding, small gaps |
| 10px  | -      | logo gap, menu gaps |
| 12px  | sm     | nav padding, chip padding vertical |
| 14px  | -      | button padding-vertical, card body padding |
| 16px  | md     | section tag padding, standard gaps |
| 18px  | -      | button padding-horizontal (sm), card body padding |
| 20px  | -      | container padding (mobile), card body padding |
| 24px  | lg     | section header margin, sidebar padding |
| 28px  | -      | nav link gap, button padding-horizontal |
| 32px  | xl     | catalog layout gap, section padding (mobile) |
| 36px  | -      | button padding-horizontal (lg), hero button margin |
| 40px  | -      | catalog hero padding, hero grid gap (tablet) |
| 48px  | -      | section header margin-bottom, catalog section padding-top |
| 60px  | -      | hero grid gap (desktop), catalog empty padding |
| 64px  | -      | section padding (mobile: 64px 0), hero inner padding |
| 96px  | 2xl    | section padding (desktop: 96px 0) |

**Principle:** Prefer these values; avoid arbitrary numbers like 17px or 23px unless matching a specific visual component's geometry.

---

## Breakpoints

```scss
// Tablet / collapsed header
@media (max-width: 1024px) { ... }   // nav hides, burger appears

// Mobile
@media (max-width: 900px)  { ... }   // catalog layout collapses to 1 column
@media (max-width: 768px)  { ... }   // section padding shrinks, mobile-first layouts
@media (max-width: 540px)  { ... }   // 2-col product grid, hero full-bleed image
@media (max-width: 767px)  { ... }   // iOS input font-size fix (16px to prevent zoom)
```

**Mobile-first or desktop-first?** The existing codebase uses **desktop-first** (`max-width` queries). New styles should follow the same convention — write the desktop layout first, then add `@media (max-width: ...)` overrides.

---

## SCSS File Structure

```
styles/
├── main.scss              ← Entry point only (imports, no rules here)
├── base/
│   ├── _variables.scss    ← ALL design tokens (edit here to change the palette)
│   └── _reset.scss        ← Box-sizing, font defaults, focus-visible, iOS fix
├── layout/
│   ├── _container.scss    ← .container, .section, .sec-header, .sec-tag, .sec-title, .sec-sub
│   ├── _header.scss       ← .header, .h-nav, .h-icon-btn, .burger, .mob-menu
│   ├── _footer.scss       ← Footer layout
│   ├── _mobile-nav.scss   ← Mobile bottom nav bar
│   └── _mobile-menu.scss  ← Mobile slide-out menu
├── components/
│   ├── _buttons.scss      ← .btn, all variants (.btn-dark, .btn-outline, .btn-caramel, .btn-white, .btn-ghost)
│   ├── _product-card.scss ← .product-card, .pc-*, .badge-*
│   ├── _category-card.scss← Category grid cards
│   ├── _side-panels.scss  ← Cart panel, favorites panel
│   ├── _auth.scss         ← Auth modal
│   ├── _checkout.scss     ← Checkout modal
│   ├── _quick-view.scss   ← Quick view modal
│   ├── _notifications.scss← Toast / notification UI
│   ├── _profile.scss      ← Profile modal
│   ├── _orders.scss       ← Order history UI
│   ├── _branch-selector.scss ← Branch picker modal
│   └── _adia-toast.scss   ← Toast messages
├── pages/
│   ├── _hero.scss         ← .hero, .hero-h1, .hero-inner, .f-card, .hero-trust
│   ├── _catalog.scss      ← Catalog section on homepage
│   ├── _catalog-page.scss ← catalog.html full layout (.catalog-*, .cat-*)
│   ├── _services.scss     ← Services/benefits section
│   ├── _reviews.scss      ← Reviews/testimonials section
│   ├── _branches.scss     ← Branches section
│   └── _cta.scss          ← CTA section
└── utilities/
    └── _animations.scss   ← @keyframes (blink, float1, float2), .anim scroll-reveal
```

**Where to add new styles:**
- New reusable UI component → `components/_your-component.scss`, then `@use` it in `main.scss`
- New page section → `pages/_your-page.scss`, then `@use` it in `main.scss`
- New token → `base/_variables.scss` only, never inline in component files
- One-off page fix → add to the most specific existing file (don't create a new file for 3 lines)

**Compile command:**
```bash
sass styles/main.scss styles/main.css --style=expanded
# Never edit main.css directly — it is generated output
```

---

## Existing Selectors Reference

### Layout
`.container` · `.section` · `.sep`  
`.sec-header` · `.sec-tag` · `.sec-title` · `.sec-sub`  
`.header` · `.header-inner` · `.logo` · `.logo-icon` · `.logo-name`  
`.h-nav` · `.h-actions` · `.h-icon-btn` · `.cart-badge` · `.h-cta`  
`.burger` · `.mob-menu` · `.mob-menu-foot`

### Components — Buttons
`.btn` · `.btn-dark` · `.btn-outline` · `.btn-caramel` · `.btn-white` · `.btn-ghost`  
`.btn-lg` · `.btn-sm` · `.btn-outline-dark`  
All buttons: `border-radius: 100px` (pill shape), `font-family: 'Nunito'`, `font-weight: 700`

### Components — Product Card
`.product-card` · `.pc-img` · `.pc-ph` · `.pc-badge`  
`.badge-today` · `.badge-hit` · `.badge-new`  
`.pc-fav` · `.pc-body` · `.pc-name` · `.pc-desc` · `.pc-foot`  
`.pc-price` · `.pc-add` · `.pc-add.added` · `.pc-add--in-cart` · `.pc-add-count`

### Components — Catalog Page
`.catalog-hero` · `.catalog-title` · `.catalog-sub` · `.catalog-count-badge`  
`.catalog-layout` · `.cat-sidebar` · `.cat-filter-group` · `.cat-cat-btn`  
`.cat-main` · `.cat-toolbar` · `.cat-results-count` · `.products-grid`

### Utilities
`.anim` / `.anim.visible` — scroll-reveal (opacity + translateY)  
`.sep` — horizontal 1px rule with `--border` color

---

## Accessibility Rules

### Touch Targets
- **Minimum 44×44px** for all interactive elements on mobile
- `.h-icon-btn` → 44×44px ✅
- `.pc-fav` → 44×44px ✅
- `.pc-add` → 44×44px ✅ (reduces to 32×32px at 540px — acceptable for space-constrained 2-col grid)
- New interactive elements must meet this minimum

### Focus Styles
Globally set in `_reset.scss`:
```scss
*:focus-visible {
  outline: 2px solid var(--caramel-dark);
  outline-offset: 2px;
}
```
- **Never** remove `outline` without providing an equivalent custom focus style
- Use `:focus-visible` (not `:focus`) to avoid showing outlines on mouse click
- The caramel-dark outline has sufficient contrast on both light and dark backgrounds

### Contrast (WCAG AA — 4.5:1 for normal text, 3:1 for large text)
- Body text: always `--text-dark` or `--text-med` on light backgrounds
- Don't use `--text-muted` for body-length text (use only for metadata, timestamps)
- Never use `--caramel` as a text color on white/cream backgrounds — it fails contrast
- `--coffee-dark` is safe for text on light backgrounds

### Motion
```scss
// In _animations.scss — always present
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
New animations must be covered by this rule — don't add a second `prefers-reduced-motion` block; it already exists.

### iOS Input Zoom Fix
```scss
// In _reset.scss — already handles this
@media (max-width: 767px) {
  input[type='text'], input[type='tel'], /* ... */ { font-size: 16px !important; }
}
```
Any new `<input>` type must be added here if not covered.

---

## Hover / Focus Patterns

The project uses **three consistent hover patterns**. Match the right one to the context:

### 1. Lift + shadow (cards, large interactive surfaces)
```scss
&:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-m);
}
// Active / press:
&:active { transform: scale(0.97); }
```
Used by: `.product-card`, `.btn-dark`, `.btn-outline`, `.btn-caramel`

### 2. Scale (circular icon buttons)
```scss
&:hover {
  transform: scale(1.05);   // or 1.1 for smaller targets
  background: var(--caramel);
}
```
Used by: `.h-icon-btn`, `.pc-fav`, `.pc-add`

### 3. Background swap (list items, filter chips, nav links)
```scss
&:hover { background: var(--beige); color: var(--text-dark); }
&.active { background: var(--caramel); color: var(--text-dark); }
```
Used by: `.cat-cat-btn`, `.mob-menu a`, `.h-nav a` (underline variant)

### Nav link underline pattern
```scss
a {
  position: relative;
  &::after {
    content: '';
    position: absolute;
    bottom: -4px; left: 0;
    width: 0; height: 2px;
    background: var(--caramel-dark);
    border-radius: 2px;
    transition: width var(--ease);
  }
  &:hover::after { width: 100%; }
}
```

### Touch device rule
On `@media (max-width: 1024px)`, suppress `:hover` background on tappable links and use `:active` instead. Hover stays "stuck" after tap on iOS.

```scss
@media (max-width: 1024px) {
  .mob-menu a:hover  { background: transparent; }
  .mob-menu a:active { background: var(--beige); }
}
```

---

## Premium Bakery Aesthetic Rules

ADIA is a **premium warm-toned bakery**, not a generic e-commerce site. Every design decision should reinforce warmth, craftsmanship, and quality.

### Do
- Use the warm palette consistently — milk, cream, beige, caramel, coffee
- Set headings in Cormorant Garamond (serif elegance)
- Use `border-radius: 100px` for pills, `var(--r-lg)` or `var(--r-xl)` for cards (soft, organic shapes)
- Add subtle transitions (`var(--ease)`) — everything feels fluid, never snappy
- Lift cards on hover (`translateY(-4px)`) — tactile, responsive to touch
- Use `backdrop-filter: blur()` for overlays and floating elements (glassmorphism, used in header)
- Floating cards / decorative elements on sections communicate "crafted, not templated"
- Use `clamp()` for display text so it scales naturally without hard breakpoints
- Warm shadows — always `rgba(44, 24, 16, ...)` (chocolate-tinted), never neutral grey
- `radial-gradient` backgrounds with caramel/coffee tones for hero sections

### Don't
- No pure black (`#000`) or cold grey — use the warm token equivalents
- No hard geometric corners on content cards (use `--r-md` minimum)
- No flat, unshadowed modals — always `var(--shadow-l)`
- No snappy 0.1s transitions — minimum 0.25s with the cubic-bezier ease
- No new font families — Cormorant Garamond + Nunito is the complete set
- No blue, purple, or cool-toned accent colors — the palette is warm caramel-coffee

---

## How to Add New Styles Without Breaking the System

### Step 1 — Identify the right file
- Reusable across pages → `components/`
- Page-specific → `pages/`
- New token needed → `base/_variables.scss` only

### Step 2 — Use existing tokens
```scss
// ✅ Correct
.my-new-thing {
  background: var(--cream);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-s);
  transition: var(--ease);
  color: var(--text-dark);
}

// ❌ Wrong
.my-new-thing {
  background: #FFF8F0;      // hardcoded — breaks theming
  border-radius: 15px;      // off-scale — use --r-md (16px)
  transition: 0.2s ease;    // wrong easing — use --ease
}
```

### Step 3 — Follow the BEM-light naming convention
ADIA uses block-level prefixes (`.pc-*` for product card, `.cat-*` for catalog, `.h-*` for header). New components should follow the same pattern:
```scss
// New component: order card → .oc-*
.order-card   { ... }
.oc-header    { ... }
.oc-status    { ... }
.oc-actions   { ... }
```

### Step 4 — Register in main.scss
After creating `styles/components/_order-card.scss`:
```scss
// In main.scss, under "3. Components":
@use 'components/order-card';
```

### Step 5 — Mobile-last (desktop-first)
Write desktop styles first, then wrap mobile overrides in `@media (max-width: ...)`:
```scss
.my-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
```

### Step 6 — Compile
```bash
sass styles/main.scss styles/main.css --style=expanded
```
Check the browser after compiling. The source of truth is always the compiled `main.css`, not SCSS alone.
