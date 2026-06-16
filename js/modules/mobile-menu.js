// ================================
//  MOBILE MENU
//  Renders fresh dynamic content each open:
//  branch name, auth state, notification badge, fav count.
//  Replaces the static .mob-menu HTML entirely.
// ================================

import { getCurrentUser, logout, isAdmin } from '../services/auth-service.js';
import { getSelectedBranch }               from '../store/branch-store.js';
import { openBranchModal }                 from './branch-selector.js';
import { openAuthModal }                   from './auth-modal.js';
import { openMyOrders }                    from './my-orders.js';

const MENU_ID    = 'mobMenu';
const BACK_ID    = 'mobMenuBackdrop';

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Helpers to read live DOM state ────────────────────────────────────────────

function _favCount() {
  const el = document.getElementById('favCount');
  if (!el || el.style.display === 'none') return 0;
  return parseInt(el.textContent || '0', 10) || 0;
}

function _hasNotif() {
  // .orders-menu-badge reflects unread state via notification-service.js
  return document.querySelector('.orders-menu-badge:not([hidden])') !== null;
}

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
  const favCnt = _favCount();
  const notif  = _hasNotif();

  // Resolve links: on catalog.html, prefix with index.html for anchor links
  const idx = _isIndexPage();
  const homeHref       = idx ? '#hero'     : 'index.html';
  const showcaseHref   = idx ? '#today'    : 'index.html#today';
  const branchesHref   = idx ? '#branches' : 'index.html#branches';
  const contactsHref   = idx ? '#footer'   : 'index.html#footer';

  menu.innerHTML = `
    <button type="button" class="mm-branch-row" id="mmBranchBtn">
      <span class="mm-branch-ico">📍</span>
      <span class="mm-branch-name">${branch ? _esc(branch.name) : 'Выбрать филиал'}</span>
      <span class="mm-branch-arr">▼</span>
    </button>

    <nav class="mm-nav">
      <a class="mm-nav-link" href="${homeHref}">🏠&nbsp; Главная</a>
      <a class="mm-nav-link" href="${showcaseHref}">✨&nbsp; Витрина сегодня</a>
      <a class="mm-nav-link" href="catalog.html">📋&nbsp; Каталог</a>
      <a class="mm-nav-link" href="${branchesHref}">📍&nbsp; Филиалы</a>
      <a class="mm-nav-link" href="${contactsHref}">📞&nbsp; Контакты</a>
    </nav>

    <div class="mm-divider"></div>

    <button type="button" class="mm-item mm-item--fav" id="mmFavBtn">
      <i class="ti ti-heart"></i>
      Избранное
      ${favCnt > 0 ? `<span class="mm-badge">${favCnt}</span>` : ''}
    </button>

    ${user ? `
      <div class="mm-profile-info">
        <div class="mm-profile-name">${_esc(user.name || '')}</div>
        <div class="mm-profile-phone">${_esc(user.phone || '')}</div>
      </div>

      <div class="mm-divider"></div>

      <button type="button" class="mm-item" id="mmOrdersBtn">
        📋&nbsp; Мои заказы
        ${notif ? '<span class="mm-notif">!</span>' : ''}
      </button>
      ${isAdmin() ? `<a class="mm-item" href="/admin/orders.html">🔧&nbsp; Панель администратора</a>` : ''}
      <button type="button" class="mm-item mm-item--danger" id="mmLogoutBtn">Выйти</button>
    ` : `
      <button type="button" class="mm-item mm-item--login" id="mmLoginBtn">👤&nbsp; Войти</button>
    `}`;

  // ── Wire events (fresh DOM, no stacking) ─────────────────────────────────

  document.getElementById('mmBranchBtn')?.addEventListener('click', () => {
    _close();
    openBranchModal();
  });

  document.getElementById('mmFavBtn')?.addEventListener('click', () => {
    _close();
    // Delegate to existing favBtn whose handler is set up by favorites.js
    document.getElementById('favBtn')?.click();
  });

  menu.querySelectorAll('.mm-nav-link').forEach(a => {
    a.addEventListener('click', _close);
  });

  if (user) {
    document.getElementById('mmOrdersBtn')?.addEventListener('click', () => {
      _close();
      openMyOrders();
    });
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
  _render(); // always fresh
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

  // Backdrop click closes
  document.getElementById(BACK_ID)?.addEventListener('click', _close);

  // ESC closes
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') _close();
  });

  // Re-render while open so live state stays current (auth, branch, badges)
  window.addEventListener('adia:auth-change',   () => {
    if (document.getElementById(MENU_ID)?.classList.contains('open')) _render();
  });
  window.addEventListener('adia:branch-change', () => {
    if (document.getElementById(MENU_ID)?.classList.contains('open')) _render();
  });
}
