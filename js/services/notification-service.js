// ================================
//  NOTIFICATION SERVICE
//  Polling-based: every 30s checks Supabase for new events.
//  Admin:  new orders + client cancellations → badge on "Заказы" sidebar link
//  Client: order status changes → badge on profileBtn
// ================================

import { sbFetch }             from '../api/supabase-client.js';
import { countActiveOrders }  from '../api/orders-api.js';

const ORDERS_TBL = 'orders';
const POLL_MS    = 30_000;

const KEY_ADMIN  = 'adia_notif_admin';
const KEY_CLIENT = id => `adia_notif_client_${id}`;

// Statuses that trigger a client notification (badge)
const CLIENT_NOTIFY = new Set(['awaiting_client', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'cancelled_by_client']);

// ── State ─────────────────────────────────────────────────────────────────────

let _timer        = null;
let _prevIds      = null; // null = first poll (no toasts on first load)
let _unread       = 0;
let _activeOrders = 0;   // in-progress orders count for #mnOrdersBadge
let _userId       = null;
let _mode         = null; // 'admin' | 'client'

// ── Storage ───────────────────────────────────────────────────────────────────

function _getReadAt(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key) || 'null');
    // Default to now so first-time visitors don't see stale "unread" notifications
    return s?.readAt || new Date().toISOString();
  } catch { return new Date().toISOString(); }
}

function _setReadAt(key, ts) {
  localStorage.setItem(key, JSON.stringify({ readAt: ts }));
}

// ── Poll ──────────────────────────────────────────────────────────────────────

async function _pollAdmin() {
  const readAt = _getReadAt(KEY_ADMIN);
  const enc    = encodeURIComponent;

  const [newOrders, cancels] = await Promise.all([
    sbFetch(`/${ORDERS_TBL}?created_at=gt.${enc(readAt)}&order=created_at.desc`).catch(() => []),
    sbFetch(`/${ORDERS_TBL}?status=eq.cancelled_by_client&updated_at=gt.${enc(readAt)}`).catch(() => []),
  ]);

  const seen = new Map();
  [...(Array.isArray(newOrders) ? newOrders : []),
   ...(Array.isArray(cancels)   ? cancels   : [])]
    .forEach(o => seen.set(o.id + ':' + o.status, o));
  const items = [...seen.values()];

  _unread = items.length;
  _updateBadge();

  if (_prevIds !== null) {
    const prev = new Set(_prevIds);
    items
      .filter(o => !prev.has(o.id + ':' + o.status))
      .forEach(o => {
        const cancel = o.status === 'cancelled_by_client';
        _toast(
          cancel
            ? `Клиент отменил заказ ${o.order_number ? '#' + o.order_number : ''}`
            : `Новый заказ ${o.order_number ? '#' + o.order_number : ''}`,
          cancel ? 'warn' : 'success'
        );
      });
  }
  _prevIds = items.map(o => o.id + ':' + o.status);
}

async function _pollClient() {
  const readAt = _getReadAt(KEY_CLIENT(_userId));
  const enc    = encodeURIComponent;

  const orders = await sbFetch(
    `/${ORDERS_TBL}?user_id=eq.${enc(_userId)}&updated_at=gt.${enc(readAt)}&order=updated_at.desc`
  ).catch(() => []);

  const items = (Array.isArray(orders) ? orders : [])
    .filter(o => CLIENT_NOTIFY.has(o.status));

  _unread = items.length;
  _updateBadge();

  _prevIds = items.map(o => o.id + ':' + o.status);

  // Refresh active-orders badge in parallel (non-blocking)
  _refreshActiveOrders();
}

function _clientMsg(o) {
  const n = o.order_number ? ` #${o.order_number}` : '';
  return {
    awaiting_client: `Заказ${n}: состав изменён — нужно ваше подтверждение`,
    confirmed:       `Заказ${n} подтверждён кондитерской`,
    preparing:       `Заказ${n} готовится`,
    ready:           `Заказ${n} готов к выдаче`,
    completed:       `Заказ${n} выполнен`,
    cancelled:       `Заказ${n} отменён`,
  }[o.status] || `Статус заказа${n} изменён`;
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function _updateBadge() {
  if (_mode === 'admin') {
    // Badge on every "Заказы" sidebar link found on the page
    document.querySelectorAll('.a-nav-link[href="orders.html"]').forEach(link => {
      _setBadge(link, _unread);
    });
  } else {
    // Badge on profile button (unread notifications)
    const btn = document.getElementById('profileBtn');
    if (btn) _setBadge(btn, _unread);
  }
}

function _updateOrdersBadge() {
  const count   = _activeOrders;
  const display = count > 99 ? '99+' : String(count);

  const mnBadge = document.getElementById('mnOrdersBadge');
  if (mnBadge) {
    mnBadge.textContent = display;
    mnBadge.classList.toggle('hidden', count === 0);
  }

  // Burger menu / desktop "Мои заказы" badge if present
  const menuBadge = document.querySelector('.orders-active-badge');
  if (menuBadge) {
    menuBadge.textContent = display;
    menuBadge.toggleAttribute('hidden', count === 0);
  }
}

async function _refreshActiveOrders() {
  if (_mode !== 'client' || !_userId) return;
  _activeOrders = await countActiveOrders(_userId);
  _updateOrdersBadge();
}

function _setBadge(el, count) {
  // Client mode: profile icon gets a "!" exclamation badge
  // Admin mode:  sidebar order link gets a numeric count badge
  const cls = _mode === 'client' ? 'profile-notification-badge' : 'notif-dot';
  let badge = el.querySelector('.' + cls);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = cls;
    el.appendChild(badge);
  }
  if (count > 0) {
    badge.textContent = _mode === 'client' ? '!' : (count > 9 ? '9+' : String(count));
    badge.removeAttribute('hidden');
  } else {
    badge.setAttribute('hidden', '');
  }

  // Keep the inline "!" badge next to "Мои заказы" in the dropdown in sync
  if (_mode === 'client') {
    const menuBadge = document.querySelector('.orders-menu-badge');
    if (menuBadge) {
      if (count > 0) menuBadge.removeAttribute('hidden');
      else menuBadge.setAttribute('hidden', '');
    }
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let _toastWrap = null;

function _ensureToastWrap() {
  if (_toastWrap && document.body.contains(_toastWrap)) return _toastWrap;
  _toastWrap = document.createElement('div');
  _toastWrap.id        = 'notifToasts';
  _toastWrap.className = 'notif-toasts';
  document.body.appendChild(_toastWrap);
  return _toastWrap;
}

function _escNotif(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _toast(message, type = 'info') {
  const wrap = _ensureToastWrap();
  const el   = document.createElement('div');
  el.className = `notif-toast notif-toast--${type}`;

  const icons = { success: '🛍️', warn: '⚠️', info: '🔔' };
  el.innerHTML = `
    <span class="notif-toast__ico">${icons[type] || '🔔'}</span>
    <span class="notif-toast__msg">${_escNotif(message)}</span>
    <button class="notif-toast__close" aria-label="Закрыть">✕</button>
  `;

  el.querySelector('.notif-toast__close').addEventListener('click', () => _dismissToast(el));
  wrap.appendChild(el);

  // Animate in
  requestAnimationFrame(() => el.classList.add('notif-toast--in'));

  // Auto-dismiss after 6s
  setTimeout(() => _dismissToast(el), 6000);

  // Keep max 3 toasts
  const all = [...wrap.querySelectorAll('.notif-toast')];
  if (all.length > 3) _dismissToast(all[0]);
}

function _dismissToast(el) {
  el.classList.remove('notif-toast--in');
  el.classList.add('notif-toast--out');
  setTimeout(() => el.remove(), 350);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function markAdminNotifRead() {
  _setReadAt(KEY_ADMIN, new Date().toISOString());
  _unread  = 0;
  _prevIds = _prevIds ?? [];
  _updateBadge();
}

export function markClientNotifRead() {
  if (!_userId) return;
  _setReadAt(KEY_CLIENT(_userId), new Date().toISOString());
  _unread  = 0;
  _prevIds = _prevIds ?? [];
  _updateBadge();
}

export function initAdminNotifications() {
  _mode   = 'admin';
  _userId = null;
  if (_timer) clearInterval(_timer);
  _pollAdmin();
  _timer = setInterval(_pollAdmin, POLL_MS);
}

export function initClientNotifications(userId) {
  _mode   = 'client';
  _userId = userId;
  if (_timer) clearInterval(_timer);
  _pollClient();
  _refreshActiveOrders();
  _timer = setInterval(_pollClient, POLL_MS);
}

export function stopNotifications() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

// Clear orders badge on logout; refresh on new order placed
window.addEventListener('adia:auth-change', e => {
  const user = e.detail?.user;
  if (!user || user.type !== 'client') {
    _activeOrders = 0;
    _updateOrdersBadge();
  }
});

window.addEventListener('adia:order-created', () => {
  if (_mode === 'client') _refreshActiveOrders();
});
