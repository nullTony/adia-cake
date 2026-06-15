// ================================
//  PROFILE MENU
//  Injects a dropdown below the profile button.
//  Reacts to 'adia:auth-change' — no manual refresh needed.
// ================================

import { getCurrentUser, isAdmin, logout } from '../services/auth-service.js';
import { openAuthModal }                   from './auth-modal.js';
import { openMyOrders }                    from './my-orders.js';

const DROPDOWN_ID = 'profileDropdown';

// ── Inject dropdown HTML once ─────────────────────────────────────────────────

function injectDropdown() {
  if (document.getElementById(DROPDOWN_ID)) return;
  const el = document.createElement('div');
  el.id = DROPDOWN_ID;
  el.className = 'profile-dropdown';
  el.innerHTML = `
    <div class="profile-dropdown__info">
      <span class="profile-dropdown__name"  id="profileDropName"></span>
      <span class="profile-dropdown__phone" id="profileDropPhone"></span>
    </div>
    <hr class="profile-dropdown__sep">
    <a   class="profile-dropdown__item" id="profileDropAdmin" href="/admin/products.html">Панель администратора</a>
    <button class="profile-dropdown__item" id="profileDropOrders">Мои заказы<span class="orders-menu-badge" hidden>!</span></button>
    <button class="profile-dropdown__item profile-dropdown__item--danger" id="profileDropLogout">Выйти</button>
  `;
  document.body.appendChild(el);

  document.getElementById('profileDropOrders').addEventListener('click', () => {
    _closeDropdown();
    openMyOrders();
  });

  document.getElementById('profileDropLogout').addEventListener('click', () => {
    logout();
    _closeDropdown();
  });

  // Close on outside click (uses capture so it fires even if inner clicks stop propagation)
  document.addEventListener('click', e => {
    const drop = document.getElementById(DROPDOWN_ID);
    if (!drop?.classList.contains('open')) return;
    if (!e.target.closest('#' + DROPDOWN_ID) && !e.target.closest('#profileBtn')) {
      _closeDropdown();
    }
  }, true);
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function _openDropdown() {
  const btn  = document.getElementById('profileBtn');
  const drop = document.getElementById(DROPDOWN_ID);
  if (!btn || !drop) return;

  const rect = btn.getBoundingClientRect();
  // position: fixed uses viewport coords — no scrollY offset
  drop.style.top   = (rect.bottom + 8) + 'px';
  drop.style.right = (window.innerWidth - rect.right) + 'px';
  drop.classList.add('open');
}

function _closeDropdown() {
  document.getElementById(DROPDOWN_ID)?.classList.remove('open');
}

// ── Update button + dropdown content ──────────────────────────────────────────

export function updateProfileBtn() {
  const btn = document.getElementById('profileBtn');
  if (!btn) return;

  const user = getCurrentUser();
  btn.setAttribute('aria-label', user ? (user.name || 'Профиль') : 'Войти');

  const nameEl    = document.getElementById('profileDropName');
  const phoneEl   = document.getElementById('profileDropPhone');
  const adminLink = document.getElementById('profileDropAdmin');
  const ordersBtn = document.getElementById('profileDropOrders');

  if (nameEl)    nameEl.textContent    = user?.name  || '';
  if (phoneEl)   phoneEl.textContent   = user?.phone || '';
  if (adminLink) adminLink.style.display = isAdmin() ? '' : 'none';
  if (ordersBtn) ordersBtn.style.display = user ? '' : 'none';
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initProfileMenu() {
  injectDropdown();
  updateProfileBtn();

  const btn = document.getElementById('profileBtn');
  if (!btn) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const user = getCurrentUser();
    if (!user) {
      openAuthModal();
    } else {
      const drop = document.getElementById(DROPDOWN_ID);
      if (drop?.classList.contains('open')) {
        _closeDropdown();
      } else {
        _openDropdown();
      }
    }
  });

  window.addEventListener('adia:auth-change', () => {
    updateProfileBtn();
    _closeDropdown();
  });
}
