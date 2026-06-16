# ADIA Cake — Project Context

## Stack
- Frontend: Vanilla HTML/CSS/JS (no frameworks)
- DB/Auth: Supabase (PostgreSQL + REST + RLS enabled)
- Bot: Node.js + node-telegram-bot-api (`cd bot && node bot.js`)
- Dev: Live Server @ 127.0.0.1:5500

## Architecture
```
/
├── index.html          # Landing + daily showcase
├── catalog.html        # Product catalog
├── admin/
│   ├── orders.html     # Order management
│   └── products.html   # Product management
└── js/
    ├── api/
    ├── components/
    ├── services/
    ├── modules/
    └── utils/
```

---

## Supabase Tables (schema)

### clients
| field | type | notes |
|---|---|---|
| id | uuid | PK |
| full_name | text | |
| phone | text | unique |
| telegram_chat_id | text | |
| telegram_username | text | |
| is_verified | bool | |
| created_at | timestamp | |

### staff_users
| field | type | notes |
|---|---|---|
| id | uuid | PK |
| full_name | text | |
| phone | text | |
| password | text | hashed |
| role | enum | owner / admin / manager |
| is_active | bool | |

### products
| field | notes |
|---|---|
| id, title, slug, description, price, image_url, category, is_active, sort_order, created_at | working ✅ |

### branches
| field | notes |
|---|---|
| id, title, address, phone, is_active, sort_order, created_at | working ✅ |

### orders
| field | notes |
|---|---|
| id, client_id, client_name, client_phone | |
| delivery_type | delivery / pickup |
| pickup_branch_id, pickup_branch_name | |
| comment, status, total_amount, confirmed_total | |
| cancellation_reason, created_at, updated_at | |

**Order statuses:** `new → confirmed → preparing → ready → completed / cancelled`

### order_items
| field | notes |
|---|---|
| order_id, product_id, product_name, price | |
| requested_quantity | customer requested |
| confirmed_quantity | admin confirmed (can be less) |
| status | pending / confirmed / partial / unavailable |

### telegram_verifications
| field | notes |
|---|---|
| phone, verification_code, telegram_chat_id, telegram_username | |
| status | pending / waiting_for_bot / verified / expired |
| expires_at, created_at, verified_at | |

---

## Auth

### Session
```js
// Key: 'adia_client' in localStorage
// Shape: { id, full_name, phone, telegram_chat_id, ... }

function isAuthenticated() {
  try {
    const s = localStorage.getItem('adia_client');
    if (!s) return false;
    const p = JSON.parse(s);
    return !!(p && p.id);
  } catch { return false; }
}
```

### Telegram Verification Flow
1. User enters phone → create row in `telegram_verifications`
2. If bot knows phone → send code automatically
3. Else → user presses "Open Bot" → /start → bot verifies phone match → sends code
4. Code entered on site → verify → create/update `clients` row → set session

**Security rule:** code is sent ONLY if Telegram account phone matches entered phone.

---

## Business Logic

### Partial Order Confirmation
- Admin can reduce `confirmed_quantity` per item
- `confirmed_total` = sum of (confirmed_qty × price)
- Item gets status: `partial` or `unavailable`
- Customer receives Telegram notification → must Accept or Cancel

### Inventory
- NO hard inventory locking
- Bakery manually confirms availability
- Never auto-block purchases

### Admin Quantity UX Rule
> `confirmed_quantity` inputs must default to `requested_quantity`
> Admin only edits items that are unavailable

---

## Telegram Bot Notifications

### Templates (RU)
```
// New order (to admin)
🆕 Новый заказ #{{id}} от {{name}} ({{phone}})

// Order confirmed (to client)  
✅ Заказ #{{id}} подтверждён
✅ Подтверждено: {{item}} ×{{confirmed_qty}}
❌ Нет в наличии: {{item}} ×{{unavailable_qty}}
💰 Итого: {{confirmed_total}} сум

// Status updates (to client)
👨‍🍳 Ваш заказ готовится
🎂 Ваш заказ готов к получению
❤️ Спасибо за заказ
❌ Заказ отменён. Причина: {{reason}}
```

---

## UI System

**Palette:** beige / brown / warm whites  
**Style:** premium bakery, soft shadows, rounded cards, elegant typography  
**Avoid:** aggressive colors, heavy dashboards, technical UI for customers

---

## Working Features ✅
- Products, Branches from Supabase
- Admin orders panel (status, partial confirm, cancel)
- Order creation + checkout modal
- Telegram bot + notifications (both sides)
- Customer + Staff sections in admin
- Supabase RLS policies

## Rules for Claude

### Code Style & Structure
- Vanilla JS only (no frameworks unless asked)
- Preserve RLS compatibility
- Never expose passwords or admin credentials
- Keep modular file structure
- No MockAPI (fully removed — Supabase only)
- Match existing code style
- Comments only where logic is non-obvious

### Git & Version Control
**Important:** Commit and push to GitHub regularly to preserve work status and prevent data loss.
- After completing each feature or fix → create a Git commit
- Use clear, descriptive commit messages (e.g., "Add mobile grid layout for today showcase")
- Include "why" in commit message, not just "what"
- Push to GitHub after each logical chunk of work
- Never force-push unless explicitly asked
- Commit messages should be atomic (one logical change per commit)