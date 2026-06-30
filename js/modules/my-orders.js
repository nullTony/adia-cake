// ================================
//  MY ORDERS — user-facing order history panel
// ================================

import { getCurrentUser }                                                             from '../services/auth-service.js';
import { getOrdersByUserId, getMyOrderItems, clientUpdateOrderStatus } from '../api/orders-api.js';
import { markClientNotifRead }                                 from '../services/notification-service.js';
import { notifyManagerClientConfirmed,
         notifyManagerClientCancelled }                       from '../services/manager-notification-service.js';
import { esc, formatPrice, formatDate }                      from '../utils/format.js';

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  new:                 'Новый',
  confirmed:           'Подтверждён',
  preparing:           'Готовится',
  ready:               'Готов',
  completed:           'Выполнен',
  cancelled:           'Отменён',
  awaiting_client:     'Ожидает вашего подтверждения',
  cancelled_by_client: 'Отменён вами',
};

const STATUS_CLS = {
  new:                 'mo-s-new',
  confirmed:           'mo-s-confirmed',
  preparing:           'mo-s-preparing',
  ready:               'mo-s-ready',
  completed:           'mo-s-completed',
  cancelled:           'mo-s-cancelled',
  awaiting_client:     'mo-s-awaiting',
  cancelled_by_client: 'mo-s-cancelled',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcItemTotal(item, qty) {
  // productPriceSnapshot is always the final price per portion (for weight items it was
  // already computed as pricePerKg × grams / 1000 at add-to-cart time)
  return item.productPriceSnapshot * qty;
}

function statusBadge(status) {
  const label = STATUS_LABEL[status] || status || '—';
  const cls   = STATUS_CLS[status]   || 'mo-s-new';
  return `<span class="mo-badge ${cls}">${esc(label)}</span>`;
}

// ── Order timeline ────────────────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { key: 'new',       label: 'Принят' },
  { key: 'confirmed', label: 'Подтверждён' },
  { key: 'preparing', label: 'Готовится' },
  { key: 'ready',     label: 'Готов' },
  { key: 'completed', label: 'Выполнен' },
];

const STEP_ORDER = TIMELINE_STEPS.map(s => s.key);

function renderTimeline(status) {
  if (status === 'cancelled' || status === 'cancelled_by_client') {
    const label = status === 'cancelled_by_client' ? 'Отменён вами' : 'Отменён';
    return `<div class="mo-cancelled-banner">✕ ${label}</div>`;
  }

  const currentIdx = STEP_ORDER.indexOf(status);

  const steps = TIMELINE_STEPS.map((step, idx) => {
    const cls = idx < currentIdx ? 'done'
               : idx === currentIdx ? 'current'
               : '';
    return `
      <div class="mo-tl-step ${cls}">
        <div class="mo-tl-dot"></div>
        <div class="mo-tl-label">${step.label}</div>
      </div>`;
  }).join('');

  return `<div class="mo-timeline">${steps}</div>`;
}

// ── State ─────────────────────────────────────────────────────────────────────

const PANEL_ID  = 'myOrdersPanel';
let   _orders   = [];
const itemsCache = new Map();

// ── Panel HTML ────────────────────────────────────────────────────────────────

function injectPanel() {
  if (document.getElementById(PANEL_ID)) return;
  const el = document.createElement('div');
  el.id        = PANEL_ID;
  el.className = 'mo-overlay';
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('role', 'dialog');
  el.innerHTML = `
    <div class="mo-panel">
      <div class="mo-head">
        <span class="mo-title">Мои заказы</span>
        <button type="button" class="mo-close" id="myOrdersClose" aria-label="Закрыть">&times;</button>
      </div>
      <div class="mo-body" id="myOrdersBody">
        <div class="mo-loading">Загрузка…</div>
      </div>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('myOrdersClose').addEventListener('click', closeMyOrders);
  el.addEventListener('click', e => { if (e.target === el) closeMyOrders(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el.classList.contains('open')) closeMyOrders();
  });

  // Client accept / cancel — delegated so it works after re-renders
  document.getElementById('myOrdersBody').addEventListener('click', async e => {
    const acceptBtn = e.target.closest('.mo-accept-btn');
    const cancelBtn = e.target.closest('.mo-cancel-btn');
    if (acceptBtn) await _handleClientAction(acceptBtn.dataset.id, 'confirmed');
    if (cancelBtn) await _handleClientAction(cancelBtn.dataset.id, 'cancelled_by_client');
  });
}

// ── Open / close ──────────────────────────────────────────────────────────────

export async function openMyOrders() {
  injectPanel();
  const panel = document.getElementById(PANEL_ID);
  const body  = document.getElementById('myOrdersBody');
  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
  markClientNotifRead();

  body.innerHTML = `<div class="mo-loading">Загрузка…</div>`;
  _orders = [];
  itemsCache.clear();

  const user = getCurrentUser();
  if (!user) {
    body.innerHTML = `<div class="mo-empty"><div class="mo-empty-ico">👤</div><div class="mo-empty-text">Войдите в аккаунт</div></div>`;
    return;
  }

  try {
    _orders = await getOrdersByUserId(user.id, user.phone || null);
    // Assign personal order numbers (1 = oldest order).
    // getOrdersByUserId returns newest-first, so index 0 = most recent = highest number.
    const total = _orders.length;
    _orders.forEach((o, i) => { o.personalNumber = total - i; });
    renderOrders(body, _orders);
  } catch (err) {
    body.innerHTML = `<div class="mo-error">Ошибка загрузки: ${esc(err.message)}</div>`;
  }
}

export function closeMyOrders() {
  document.getElementById(PANEL_ID)?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Client actions ────────────────────────────────────────────────────────────

async function _handleClientAction(orderId, newStatus) {
  const btn = document.querySelector(`.mo-accept-btn[data-id="${orderId}"], .mo-cancel-btn[data-id="${orderId}"]`);
  if (btn) btn.disabled = true;
  try {
    const phone = getCurrentUser()?.phone || null;
    await clientUpdateOrderStatus(orderId, newStatus, phone);
    const order = _orders.find(o => o.id === orderId);
    if (order) order.status = newStatus;
    const body = document.getElementById('myOrdersBody');
    renderOrders(body, _orders);

    // Notify branch manager — fire-and-forget
    if (order) {
      if (newStatus === 'confirmed') {
        notifyManagerClientConfirmed(order).catch(() => {});
      } else if (newStatus === 'cancelled_by_client') {
        notifyManagerClientCancelled(order).catch(() => {});
      }
    }
  } catch {
    if (btn) btn.disabled = false;
    const body = document.getElementById('myOrdersBody');
    const errBanner = body?.querySelector('.mo-action-error');
    if (body && !errBanner) {
      const div = document.createElement('div');
      div.className = 'mo-action-error';
      div.textContent = 'Ошибка. Попробуйте ещё раз.';
      body.prepend(div);
      setTimeout(() => div.remove(), 4000);
    }
  }
}

// ── Render orders list ────────────────────────────────────────────────────────

function renderOrders(body, orders) {
  if (!orders.length) {
    body.innerHTML = `
      <div class="mo-empty">
        <div class="mo-empty-ico">📋</div>
        <div class="mo-empty-text">Заказов пока нет</div>
        <div class="mo-empty-sub">Оформите заказ, и он появится здесь</div>
      </div>`;
    return;
  }

  body.innerHTML = orders.map(order => {
    const isAwaiting  = order.status === 'awaiting_client';
    const hasConfirmed = order.totalConfirmedAmount > 0
      && order.totalConfirmedAmount !== order.totalRequestedAmount;

    const totalHtml = hasConfirmed
      ? `<span class="mo-card-total">${formatPrice(order.totalConfirmedAmount)}</span>
         <span class="mo-total-orig">${formatPrice(order.totalRequestedAmount)}</span>`
      : `<span class="mo-card-total">${formatPrice(order.totalRequestedAmount)}</span>`;

    const actionsHtml = isAwaiting ? `
      <div class="mo-client-actions">
        <button type="button" class="mo-accept-btn" data-id="${esc(order.id)}">✓ Принять изменения</button>
        <button type="button" class="mo-cancel-btn" data-id="${esc(order.id)}">✕ Отменить заказ</button>
      </div>` : '';

    return `
      <div class="mo-card" data-id="${esc(order.id)}">
        <div class="mo-card-head">
          <div class="mo-card-top">
            <span class="mo-order-num">#${order.personalNumber ?? order.orderNumber ?? '—'}</span>
            ${statusBadge(order.status)}
          </div>
          ${renderTimeline(order.status)}
          <div class="mo-card-meta">
            <span>${formatDate(order.createdAt)}</span>
            <div class="mo-card-totals">${totalHtml}</div>
          </div>
          ${actionsHtml}
          <button type="button" class="mo-expand-btn" data-id="${esc(order.id)}">
            Состав заказа
            <i class="mo-chevron ti ti-chevron-down"></i>
          </button>
        </div>
        <div class="mo-items-wrap" id="moItems_${esc(order.id)}" hidden>
          <div class="mo-items-loading">Загрузка…</div>
        </div>
      </div>`;
  }).join('');

  body.querySelectorAll('.mo-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleItems(btn.dataset.id, btn));
  });
}

// ── Toggle items expand ───────────────────────────────────────────────────────

async function toggleItems(orderId, btn) {
  const wrap = document.getElementById(`moItems_${orderId}`);
  if (!wrap) return;

  if (!wrap.hidden) {
    wrap.hidden = true;
    btn.querySelector('.mo-chevron').style.transform = '';
    return;
  }

  wrap.hidden = false;
  btn.querySelector('.mo-chevron').style.transform = 'rotate(180deg)';

  const order = _orders.find(o => o.id === orderId);

  if (itemsCache.has(orderId)) {
    renderItems(wrap, itemsCache.get(orderId), order);
    return;
  }

  try {
    const phone = getCurrentUser()?.phone || null;
    const items = await getMyOrderItems(orderId, phone);
    itemsCache.set(orderId, items);
    renderItems(wrap, items, order);
  } catch {
    wrap.innerHTML = `<div class="mo-items-loading">Ошибка загрузки позиций</div>`;
  }
}

// ── Render items ──────────────────────────────────────────────────────────────

function renderItems(wrap, items, order) {
  if (!items.length) {
    wrap.innerHTML = `<div class="mo-items-loading">Позиции не найдены</div>`;
    return;
  }

  const hasConfirmation = items.some(i => i.itemStatus !== 'pending');

  if (!hasConfirmation) {
    // Order not yet processed — show what was requested
    wrap.innerHTML = `
      <table class="mo-items-table">
        <tbody>
          ${items.map(item => {
            const qtyLabel = item.weightGrams
              ? `${item.weightGrams} г`
              : `× ${item.requestedQty}`;
            return `
            <tr>
              <td class="mo-item-name">${esc(item.productTitleSnapshot)}</td>
              <td class="mo-item-qty">${qtyLabel}</td>
              <td class="mo-item-sum">${formatPrice(calcItemTotal(item, item.requestedQty))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    return;
  }

  // Order has been processed — show requested vs confirmed breakdown
  const confirmedTotal = items.reduce((s, i) => s + calcItemTotal(i, i.confirmedQty), 0);

  const rows = items.map(item => {
    const isWeight = !!item.weightGrams;
    const reqLabel  = isWeight ? `${item.weightGrams} г` : `${item.requestedQty} шт`;
    const confLabel = isWeight ? `${item.weightGrams} г` : `${item.confirmedQty} шт`;

    if (item.itemStatus === 'unavailable') {
      return `
        <div class="mo-irow mo-irow--unavail">
          <span class="mo-irow-name">${esc(item.productTitleSnapshot)}</span>
          <span class="mo-irow-tag">❌ Нет в наличии</span>
        </div>`;
    }
    if (item.itemStatus === 'partial') {
      return `
        <div class="mo-irow mo-irow--partial">
          <div class="mo-irow-main">
            <span class="mo-irow-name">${esc(item.productTitleSnapshot)}</span>
            <span class="mo-irow-sum">${formatPrice(calcItemTotal(item, item.confirmedQty))}</span>
          </div>
          <div class="mo-irow-detail">
            <span class="mo-irow-sub">Запрошено: ${reqLabel}</span>
            <span class="mo-irow-conf">⚠️ Подтверждено: ${confLabel}</span>
          </div>
        </div>`;
    }
    return `
      <div class="mo-irow">
        <span class="mo-irow-name">${esc(item.productTitleSnapshot)}</span>
        <span class="mo-irow-conf">✅ ${confLabel}</span>
        <span class="mo-irow-sum">${formatPrice(calcItemTotal(item, item.confirmedQty))}</span>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="mo-ilist">
      <div class="mo-ilist-label">Вы заказали / Подтверждено кондитерской</div>
      ${rows}
      <div class="mo-ilist-total">
        <span>Итого подтверждено:</span>
        <strong>${formatPrice(confirmedTotal)}</strong>
      </div>
    </div>`;
}
