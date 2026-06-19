// ================================
//  ADMIN RBAC — Role-based access control
// ================================

const SESSION_KEY = 'adia_staff';

export const ROLE_PERMISSIONS = {
  super_admin: ['dashboard', 'products', 'categories', 'orders', 'staff', 'branch_products'],
  admin:       ['dashboard', 'products', 'categories', 'orders', 'branch_products'],
  manager:     ['orders', 'branch_products', 'categories'],
  operator:    ['orders'],
};

// Permissions that super_admin can grant to individual staff on top of their role.
export const EXTRA_GRANTABLE = ['dashboard', 'products', 'categories', 'branch_products'];

export const PERM_LABEL = {
  dashboard:      'Главная (дашборд)',
  products:       'Товары',
  categories:     'Категории',
  branch_products:'Витрина по филиалам',
  orders:         'Заказы',
  staff:          'Сотрудники',
};

const HREF_PERMISSION = {
  'index.html':           'dashboard',
  'products.html':        'products',
  'product-form.html':    'products',
  'branch-products.html': 'branch_products',
  'categories.html':      'categories',
  'orders.html':          'orders',
  'order-details.html':   'orders',
  'staff.html':           'staff',
  'clients.html':         'staff',
};

const ROLE_HOME = {
  super_admin: 'index.html',
  admin:       'index.html',
  manager:     'orders.html',
  operator:    'orders.html',
};

export function getStaffSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

export function hasPermission(permission) {
  const s = getStaffSession();
  if (!s?.role) return false;
  const base  = ROLE_PERMISSIONS[s.role] || [];
  const extra = Array.isArray(s.extra_permissions) ? s.extra_permissions : [];
  return base.includes(permission) || extra.includes(permission);
}

export function guardPage(permission) {
  const s = getStaffSession();
  if (!s?.id) {
    window.location.replace('login.html');
    return;
  }
  if (!hasPermission(permission)) {
    window.location.replace(ROLE_HOME[s.role] || 'orders.html');
  }
}

// Uses remove() — admin.css sets display:flex on .a-nav-link which overrides [hidden].
export function applyRbacToSidebar() {
  const s = getStaffSession();
  if (!s?.role) return;
  document.querySelectorAll('.a-nav-link[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href.startsWith('../')) return; // public site links — never restrict
    const file = href.split('/').pop().split('?')[0];
    const perm = HREF_PERMISSION[file];
    if (perm && !hasPermission(perm)) link.remove();
  });
}

// Fetch fresh role/extra_permissions from DB in background.
// If anything changed — update session and reload so sidebar/guard reflect new state.
async function _refreshSession() {
  const s = getStaffSession();
  if (!s?.id) return;

  try {
    const { sbFetch } = await import('../api/supabase-client.js');
    const rows = await sbFetch(
      `/staff_users?id=eq.${encodeURIComponent(s.id)}&select=role,branch_id,is_active,extra_permissions&limit=1`
    );
    if (!Array.isArray(rows) || !rows[0]) return;

    const row = rows[0];

    // Deactivated while logged in → force logout
    if (row.is_active === false) {
      localStorage.removeItem(SESSION_KEY);
      window.location.replace('login.html');
      return;
    }

    const freshExtra  = Array.isArray(row.extra_permissions) ? row.extra_permissions : [];
    const curExtra    = Array.isArray(s.extra_permissions)   ? s.extra_permissions   : [];
    const extraChanged  = JSON.stringify([...freshExtra].sort()) !== JSON.stringify([...curExtra].sort());
    const roleChanged   = row.role      !== s.role;
    const branchChanged = (row.branch_id ?? null) !== (s.branch_id ?? null);

    if (extraChanged || roleChanged || branchChanged) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        ...s,
        role:              row.role      ?? s.role,
        branch_id:         row.branch_id ?? null,
        extra_permissions: freshExtra,
      }));
      window.location.reload();
    }
  } catch { /* non-fatal — silently skip on network errors */ }
}

// Show a top banner prompting Telegram binding for staff without a linked account.
function _injectTelegramBanner() {
  const s = getStaffSession();
  if (!s?.id || s.telegram_chat_id) return;
  if (sessionStorage.getItem('tg_banner_dismissed')) return;

  const mainEl = document.querySelector('.a-main');
  if (!mainEl || document.getElementById('tg-bind-banner')) return;

  const banner = document.createElement('div');
  banner.id        = 'tg-bind-banner';
  banner.className = 'tg-bind-banner';
  banner.innerHTML = `
    <span>📱 Привяжите Telegram чтобы получать уведомления о заказах</span>
    <a href="/admin/telegram-bind.html" class="tg-bind-btn">Привязать сейчас</a>
    <button class="tg-bind-dismiss" aria-label="Закрыть">✕</button>
  `;
  banner.querySelector('.tg-bind-dismiss').addEventListener('click', () => {
    sessionStorage.setItem('tg_banner_dismissed', '1');
    banner.remove();
  });
  mainEl.prepend(banner);
}

// Single entry point for every admin page.
// 1. Blocks access synchronously if no permission.
// 2. Removes forbidden sidebar links immediately.
// 3. Silently refreshes session from DB in background.
// 4. Shows Telegram binding banner if chat_id is missing.
export function initRbac(permission) {
  guardPage(permission);
  applyRbacToSidebar();
  _refreshSession();
  _injectTelegramBanner();
}
