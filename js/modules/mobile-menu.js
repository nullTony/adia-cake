// ================================
//  MOBILE MENU
//  Renders fresh dynamic content each open: branch name, auth state.
//  Главная / Каталог / Избранное / Мои заказы — в нижнем navbar, здесь не дублируем.
// ================================

import { getCurrentUser, logout, isAdmin } from '../services/auth-service.js';
import { getSelectedBranch }               from '../store/branch-store.js';
import { openBranchModal }                 from './branch-selector.js';
import { openAuthModal }                   from './auth-modal.js';
import { esc as _esc }                    from '../utils/format.js';

const MENU_ID = 'mobMenu';
const BACK_ID = 'mobMenuBackdrop';

function _isIndexPage() {
  const p = window.location.pathname;
  return p === '/' || p.endsWith('/index.html') || p.endsWith('/');
}

// ── Render ────────────────────────────────────────────────────────────────────

function _render() {
  const menu = document.getElementById(MENU_ID);
  if (!menu) return;

  const user   = getCurrentUser();
  const branch = getSelectedBranch();

  const idx          = _isIndexPage();
  const showcaseHref = idx ? '#today'    : 'index.html#today';
  const branchesHref = idx ? '#branches' : 'index.html#branches';
  const contactsHref = idx ? '#footer'   : 'index.html#footer';

  menu.innerHTML = `
    <button type="button" class="mm-branch-row" id="mmBranchBtn">
      <span class="mm-branch-ico">📍</span>
      <span class="mm-branch-name">${branch ? _esc(branch.name) : 'Выбрать филиал'}</span>
      <span class="mm-branch-arr">▼</span>
    </button>

    <nav class="mm-nav">
      <a class="mm-nav-link" href="${showcaseHref}"><i class="ti ti-sparkles" aria-hidden="true"></i>&nbsp; Витрина сегодня</a>
      <a class="mm-nav-link" href="${branchesHref}"><i class="ti ti-map-pin" aria-hidden="true"></i>&nbsp; Филиалы</a>
      <a class="mm-nav-link" href="${contactsHref}"><i class="ti ti-phone" aria-hidden="true"></i>&nbsp; Контакты</a>
    </nav>

    <div class="mm-divider"></div>

    ${user ? `
      <div class="mm-profile-info">
        <div class="mm-profile-name">${_esc(user.name || '')}</div>
        <div class="mm-profile-phone">${_esc(user.phone || '')}</div>
      </div>

      ${isAdmin() ? `<a class="mm-item" href="/admin/orders.html">🔧&nbsp; Панель администратора</a>` : ''}
      <button type="button" class="mm-item mm-item--danger" id="mmLogoutBtn">Выйти</button>
    ` : `
      <button type="button" class="mm-item mm-item--login" id="mmLoginBtn"><i class="ti ti-user" aria-hidden="true"></i>&nbsp; Войти</button>
    `}`;

  // ── Wire events (fresh DOM, no stacking) ─────────────────────────────────

  document.getElementById('mmBranchBtn')?.addEventListener('click', () => {
    _close();
    openBranchModal();
  });

  menu.querySelectorAll('.mm-nav-link').forEach(a => {
    a.addEventListener('click', _close);
  });

  if (user) {
    document.getElementById('mmLogoutBtn')?.addEventListener('click', () => {
      logout();
      _close();
    });
  } else {
    document.getElementById('mmLoginBtn')?.addEventListener('click', () => {
      _close();
      openAuthModal();
    });
  }
}

// ── Open / close ──────────────────────────────────────────────────────────────

function _open() {
  _render();
  document.getElementById(MENU_ID)?.classList.add('open');
  document.getElementById(BACK_ID)?.classList.add('open');
  document.getElementById('burgerBtn')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _close() {
  document.getElementById(MENU_ID)?.classList.remove('open');
  document.getElementById(BACK_ID)?.classList.remove('open');
  document.getElementById('burgerBtn')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initMobileMenu() {
  document.getElementById('burgerBtn')?.addEventListener('click', () => {
    const isOpen = document.getElementById(MENU_ID)?.classList.contains('open');
    isOpen ? _close() : _open();
  });

  document.getElementById(BACK_ID)?.addEventListener('click', _close);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') _close();
  });

  window.addEventListener('adia:auth-change',   () => {
    if (document.getElementById(MENU_ID)?.classList.contains('open')) _render();
  });
  window.addEventListener('adia:branch-change', () => {
    if (document.getElementById(MENU_ID)?.classList.contains('open')) _render();
  });
}
