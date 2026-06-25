// ================================
//  NOTIFICATIONS — Rich in-app toasts for clients
//
//  Polls for order status changes every 15 s.
//  When the tab is visible → show toast immediately.
//  When the tab is hidden  → queue toast to localStorage.
//  On page load            → drain the pending queue.
// ================================

import { sbFetch }                           from './api/supabase-client.js';
import { getCurrentUser, isAuthenticated }   from './services/auth-service.js';

const ORDERS_TBL  = 'orders';
const POLL_MS     = 15_000;
const CHECK_KEY   = 'adia_notif_check';    // last poll timestamp
const PENDING_KEY = 'adia_pending_toasts'; // unseen queued toasts
const MAX_QUEUE   = 10;

// Statuses that produce a toast (cancelled_by_client excluded — self-action)
const TOAST_STATUSES = new Set([
  'awaiting_client', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled',
]);

let _pollTimer = null;

// ── Toast templates ───────────────────────────────────────────────────────────

function _template(order, status) {
  const n = order.order_number ? `#${order.order_number}` : '';
  const map = {
    confirmed:       { type: 'order_status',          title: '✅ Заказ подтверждён',        msg: `Заказ ${n} подтверждён кондитерской` },
    awaiting_client: { type: 'awaiting_confirmation', title: '⚠️ Требуется подтверждение',  msg: `Заказ ${n}: кондитерская изменила состав` },
    preparing:       { type: 'order_status',          title: '👨‍🍳 Заказ готовится',          msg: `Заказ ${n} уже готовится` },
    ready:           { type: 'order_status',          title: '🎂 Заказ готов!',             msg: `Заказ ${n} готов к получению` },
    completed:       { type: 'order_status',          title: '❤️ Спасибо за заказ!',        msg: `Заказ ${n} выполнен` },
    cancelled:       { type: 'order_cancelled',       title: '❌ Заказ отменён',             msg: `Заказ ${n} был отменён` },
  };
  return map[status] || null;
}

// ── Pending queue ─────────────────────────────────────────────────────────────

function _readQueue() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); }
  catch (e) { console.warn('[notifications] Corrupt pending queue, resetting:', e); return []; }
}

function _writeQueue(arr) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(arr.slice(-MAX_QUEUE))); }
  catch {}
}

function _enqueue(toast) {
  const q = _readQueue();
  q.push({ ...toast, seen: false });
  _writeQueue(q);
}

// ── Toast container (lazy-created) ────────────────────────────────────────────

function _container() {
  let el = document.getElementById('adia-toast-wrap');
  if (!el) {
    el = document.createElement('div');
    el.id        = 'adia-toast-wrap';
    el.className = 'adia-toast-wrap';
    // Event delegation for close buttons
    el.addEventListener('click', e => {
      const btn = e.target.closest('.adia-t-close');
      if (btn) _dismiss(btn.closest('.adia-toast'));
    });
    document.body.appendChild(el);
  }
  return el;
}

// ── Dismiss ───────────────────────────────────────────────────────────────────

function _dismiss(el) {
  if (!el) return;
  el.classList.add('adia-toast--out');
  setTimeout(() => el.remove(), 320);
}

// ── Swipe-right to dismiss (touch) ───────────────────────────────────────────

function _addSwipe(el) {
  let sx = 0, dx = 0, active = false;
  el.addEventListener('touchstart', e => {
    sx     = e.touches[0].clientX;
    active = true;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!active) return;
    dx = e.touches[0].clientX - sx;
    if (dx > 0) {
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity   = String(Math.max(0, 1 - dx / 180));
    }
  }, { passive: true });
  el.addEventListener('touchend', () => {
    active = false;
    if (dx > 80) { _dismiss(el); }
    else { el.style.transform = ''; el.style.opacity = ''; }
    dx = 0;
  });
}

// ── Show one toast ────────────────────────────────────────────────────────────

function _showToast(toast) {
  const wrap = _container();

  // Keep max 3 visible at once
  const all = [...wrap.querySelectorAll('.adia-toast')];
  if (all.length >= 3) _dismiss(all[0]);

  const el = document.createElement('div');
  el.className = `adia-toast adia-toast--${toast.type || 'order_status'}`;
  el.innerHTML = `
    <div class="adia-t-body">
      <div class="adia-t-title">${toast.title || ''}</div>
      <div class="adia-t-msg">${toast.msg || ''}</div>
    </div>
    <button class="adia-t-close" aria-label="Закрыть">✕</button>`;

  _addSwipe(el);
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('adia-toast--in'));
}

// ── Show pending toasts on page load ─────────────────────────────────────────

function _showPending() {
  if (!isAuthenticated()) return;
  const q      = _readQueue();
  const unseen = q.filter(t => !t.seen);
  if (!unseen.length) return;
  // Mark all as seen before rendering (avoids duplicates on rapid reload)
  _writeQueue(q.map(t => ({ ...t, seen: true })));
  unseen.forEach((t, i) => setTimeout(() => _showToast(t), i * 500));
}

// ── Poll checkpoint ───────────────────────────────────────────────────────────

function _getCheckpoint() {
  return localStorage.getItem(CHECK_KEY) || new Date().toISOString();
}

function _setCheckpoint(ts) {
  try { localStorage.setItem(CHECK_KEY, ts); } catch {}
}

// ── Poll for order status changes ─────────────────────────────────────────────

async function _poll() {
  if (!isAuthenticated()) return;
  const user = getCurrentUser();
  if (!user?.id) return;

  const since      = _getCheckpoint();
  const checkpoint = new Date().toISOString();
  const enc        = encodeURIComponent;

  let orders = [];
  try {
    // Primary: match by user_id
    const byId = await sbFetch(
      `/${ORDERS_TBL}?user_id=eq.${enc(user.id)}&updated_at=gt.${enc(since)}&order=updated_at.asc`
    );
    if (Array.isArray(byId) && byId.length) {
      orders = byId;
    } else if (user.phone) {
      // Fallback: match by phone (covers guest orders with null user_id)
      const byPhone = await sbFetch(
        `/${ORDERS_TBL}?phone=eq.${enc(user.phone)}&updated_at=gt.${enc(since)}&order=updated_at.asc`
      );
      orders = Array.isArray(byPhone) ? byPhone : [];
    }
  } catch { return; }

  _setCheckpoint(checkpoint);

  for (const o of orders) {
    if (!TOAST_STATUSES.has(o.status)) continue;
    const tpl = _template(o, o.status);
    if (!tpl) continue;

    const toast = {
      ...tpl,
      id:          `n_${o.id}_${o.status}`,
      orderId:     o.id,
      orderNumber: o.order_number,
    };

    if (document.visibilityState === 'hidden') {
      // Tab in background — save for when user returns
      _enqueue(toast);
    } else {
      _showToast(toast);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initNotifications() {
  if (_pollTimer) clearInterval(_pollTimer);

  // Start checkpoint fresh for this session (avoids stale toasts on return)
  _setCheckpoint(new Date().toISOString());

  _showPending();
  _poll();
  _pollTimer = setInterval(_poll, POLL_MS);
}

export function stopToastNotifications() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}
