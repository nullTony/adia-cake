// ================================
//  ADMIN — ORDERS LIST (card layout)
// ================================

import { logout, getSession }                                                from './auth.js';
import { initRbac, getStaffSession }                                        from './rbac.js';
import { getOrders, getOrderItems, updateOrderStatus, updateOrderItem, updateOrderConfirmedTotal, confirmPendingItems, fromOrder } from '../api/orders-api.js';
import { getClientById }                                                       from '../api/clients-api.js';
import { API_CONFIG }                                                           from '../config/api-config.js';
import { initAdminNotifications, markAdminNotifRead }                          from '../services/notification-service.js';
import { createProductSkeletons }                                               from '../utils/skeleton.js';

initRbac('orders');

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  new:                { label: 'Новый',             badge: 'ao-s-new'       },
  confirmed:          { label: 'Подтверждён',        badge: 'ao-s-confirmed' },
  preparing:          { label: 'Готовится',          badge: 'ao-s-preparing' },
  ready:              { label: 'Готов',              badge: 'ao-s-ready'     },
  completed:          { label: 'Выполнен',           badge: 'ao-s-completed' },
  cancelled:          { label: 'Отменён',            badge: 'ao-s-cancelled' },
  awaiting_client:    { label: 'Ожидает клиента',    badge: 'ao-s-awaiting'  },
  cancelled_by_client:{ label: 'Отменён клиентом',   badge: 'ao-s-cancelled' },
};

// Statuses the admin can manually set via the select
const ADMIN_STATUS_OPTIONS = ['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

const FILTER_TABS = [
  { key: '',                  label: 'Все' },
  { key: 'new',               label: 'Новые' },
  { key: 'awaiting_client',   label: 'Ожидает клиента' },
  { key: 'confirmed',         label: 'Подтверждён' },
  { key: 'preparing',         label: 'Готовится' },
  { key: 'ready',             label: 'Готов' },
  { key: 'completed',         label: 'Выполнен' },
  { key: 'cancelled',         label: 'Отменён' },
];

const ITEM_STATUS = {
  pending:     { label: 'Ожидает',      cls: 'ao-ib-pending'     },
  confirmed:   { label: 'Подтверждён',  cls: 'ao-ib-confirmed'   },
  partial:     { label: 'Частично',     cls: 'ao-ib-partial'     },
  unavailable: { label: 'Нет',          cls: 'ao-ib-unavailable' },
};

const DELIVERY_LABEL = { delivery: '🚚 Доставка', pickup: '🏪 Самовывоз' };

// ── DOM refs ──────────────────────────────────────────────────────────────────

const tabsEl    = document.getElementById('orderTabs');
const cardsEl   = document.getElementById('orderCards');
const searchEl  = document.getElementById('searchInput');
const statsRow  = document.getElementById('statsRow');
const countEl   = document.getElementById('ordersCount');

// ── State ─────────────────────────────────────────────────────────────────────

let allOrders    = [];
let activeFilter = '';
let searchQuery  = '';
const itemsCache = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(val) {
  return String(Math.round(val || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function esc(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusBadge(status) {
  const cfg = STATUS_CONFIG[status] || { label: status || '—', badge: 'ao-s-new' };
  return `<span class="ao-badge ${cfg.badge}">${esc(cfg.label)}</span>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function renderStats() {
  if (!statsRow) return;
  const total     = allOrders.length;
  const newCnt    = allOrders.filter(o => o.status === 'new').length;
  const activeCnt = allOrders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status)).length;
  const totalAmt  = allOrders.reduce((s, o) => s + (o.totalRequestedAmount || 0), 0);
  statsRow.innerHTML = `
    <div class="a-stat-card">
      <div class="a-stat-label">Всего заказов</div>
      <div class="a-stat-val">${total}</div>
    </div>
    <div class="a-stat-card">
      <div class="a-stat-label">Новых</div>
      <div class="a-stat-val">${newCnt}</div>
    </div>
    <div class="a-stat-card">
      <div class="a-stat-label">В работе</div>
      <div class="a-stat-val">${activeCnt}</div>
    </div>
    <div class="a-stat-card">
      <div class="a-stat-label">Сумма (заявлено)</div>
      <div class="a-stat-val" style="font-size:18px">${formatPrice(totalAmt)}</div>
    </div>`;
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

function renderTabs() {
  if (!tabsEl) return;
  tabsEl.innerHTML = FILTER_TABS.map(tab => {
    const count = tab.key === ''
      ? allOrders.length
      : allOrders.filter(o => o.status === tab.key).length;
    const active = tab.key === activeFilter ? ' active' : '';
    return `
      <button class="ao-tab${active}" data-filter="${esc(tab.key)}">
        ${esc(tab.label)}
        <span class="ao-tab-count">${count}</span>
      </button>`;
  }).join('');

  tabsEl.querySelectorAll('.ao-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      renderTabs();
      renderCards();
    });
  });
}

// ── Card HTML ─────────────────────────────────────────────────────────────────

function buildCardHtml(order) {
  const statusOptions = ADMIN_STATUS_OPTIONS.map(val => {
    const cfg = STATUS_CONFIG[val];
    return `<option value="${val}"${order.status === val ? ' selected' : ''}>${cfg.label}</option>`;
  }).join('');

  const branchDisplay = order.branchName || order.branchId || '—';
  const deliveryMeta = order.deliveryType === 'pickup'
    ? `Самовывоз · ${esc(branchDisplay)}`
    : `Доставка${order.deliveryAddress ? ' · ' + esc(order.deliveryAddress) : ''}`;

  const confirmedAmt = order.totalConfirmedAmount;
  const requestedAmt = order.totalRequestedAmount;
  const hasConfirmed = confirmedAmt > 0 && confirmedAmt !== requestedAmt;
  const amountHtml = hasConfirmed
    ? `<div class="ao-card-amount">${formatPrice(confirmedAmt)} <span class="ao-amount-orig">${formatPrice(requestedAmt)}</span></div>`
    : `<div class="ao-card-amount">${formatPrice(requestedAmt)}</div>`;

  return `
    <div class="ao-card-head" data-id="${esc(order.id)}">
      <div class="ao-card-num">#${order.orderNumber ?? '—'}</div>
      <div class="ao-card-info">
        <div class="ao-card-name">${esc(order.customerName || '—')}</div>
        <div class="ao-card-meta">${esc(order.phone || '')} · ${deliveryMeta} · ${formatDate(order.createdAt)}</div>
      </div>
      <div class="ao-card-right">
        ${amountHtml}
        <div class="ao-status-wrap" onclick="event.stopPropagation()">
          <select class="ao-status-select" data-id="${esc(order.id)}">
            ${statusOptions}
          </select>
          <i class="ao-status-arrow ti ti-chevron-down"></i>
        </div>
        ${statusBadge(order.status)}
        <i class="ao-chevron ti ti-chevron-down"></i>
      </div>
    </div>
    <div class="ao-card-body">
      ${order.comment ? `<div class="ao-body-field" style="margin-bottom:14px"><div class="ao-body-label">Комментарий клиента</div><div>${esc(order.comment)}</div></div>` : ''}
      ${order.cancelReason ? `<div class="ao-body-field" style="margin-bottom:14px"><div class="ao-body-label">Причина отмены</div><div style="color:var(--a-danger)">${esc(order.cancelReason)}</div></div>` : ''}
      <div class="ao-items-loading">Загрузка позиций…</div>
    </div>`;
}

// ── Items rendering ───────────────────────────────────────────────────────────

function calcItemStatus(confirmedQty, requestedQty) {
  if (confirmedQty === 0)           return 'unavailable';
  if (confirmedQty >= requestedQty) return 'confirmed';
  return 'partial';
}

function rowColorClass(qty, req) {
  if (qty === 0)    return 'ao-row-unavail';
  if (qty < req)    return 'ao-row-partial';
  return '';
}

const CONFIRMED_ORDER_STATUSES = ['completed', 'ready', 'preparing'];

function buildItemsHtml(items, orderId, orderStatus = '') {
  if (!items.length) return `<div style="color:var(--a-text-light);font-size:13px">Позиции не найдены</div>`;

  const rows = items.map(item => {
    const isWeight   = !!item.weightGrams;
    const reqRef     = item.requestedQty;
    // Use requestedQty when item was never individually confirmed (pending, or confirmed with qty=0)
    const useRequested = item.itemStatus === 'pending' ||
      (item.itemStatus === 'confirmed' && item.confirmedQty === 0);
    const displayQty = useRequested ? item.requestedQty : item.confirmedQty;
    // Display fallback: show 'confirmed' for pending items on completed/ready/preparing orders
    const displayStatus = (item.itemStatus === 'pending' && CONFIRMED_ORDER_STATUSES.includes(orderStatus))
      ? 'confirmed'
      : item.itemStatus === 'pending'
        ? calcItemStatus(displayQty, reqRef)
        : item.itemStatus;
    const cfg        = ITEM_STATUS[displayStatus] || ITEM_STATUS.pending;
    const rowCls     = rowColorClass(displayQty, reqRef);
    // price is always the final price per portion (weight items pre-computed at checkout)
    const displayTotal = item.productPriceSnapshot * displayQty;

    const requestedLabel = isWeight ? `${item.weightGrams} г` : item.requestedQty;

    // Weight items: binary toggle (available / not available)
    // Piece items:  numeric input
    const isAvailable = displayQty > 0;
    const confirmCell = isWeight
      ? `<div class="ao-weight-toggle-wrap">
           <button type="button" class="ao-weight-toggle${isAvailable ? ' active' : ''}">
             ${isAvailable ? '✓ Есть' : '✗ Нет'}
           </button>
           <input type="hidden" class="ao-qty-input" value="${isAvailable ? 1 : 0}">
         </div>`
      : `<div class="ao-qty-wrap">
           <input class="ao-qty-input" type="number"
                  min="0" max="${reqRef}"
                  value="${displayQty}">
         </div>`;

    return `
      <tr class="${rowCls}"
          data-item-id="${esc(String(item.id))}"
          data-req="${reqRef}"
          data-price="${item.productPriceSnapshot}"
          data-weight-grams="${item.weightGrams || 0}">
        <td data-label="Товар" style="font-weight:600">${esc(item.productTitleSnapshot)}</td>
        <td data-label="Цена" class="num">${formatPrice(item.productPriceSnapshot)}</td>
        <td data-label="Заявлено" class="ctr">${requestedLabel}</td>
        <td data-label="Подтверждено" class="ctr">${confirmCell}</td>
        <td data-label="Статус">
          <span class="ao-items-badge ${cfg.cls} ao-item-status-badge">${esc(cfg.label)}</span>
        </td>
        <td data-label="Сумма" class="num ao-item-total">${formatPrice(displayTotal)}</td>
      </tr>`;
  }).join('');

  const confirmedTotal = items.reduce((s, i) => {
    const dq = i.itemStatus === 'pending' ? i.requestedQty : i.confirmedQty;
    return s + i.productPriceSnapshot * dq;
  }, 0);

  return `
    <table class="ao-items-table">
      <thead>
        <tr>
          <th>Товар</th>
          <th class="num">Цена</th>
          <th class="ctr">Заявлено</th>
          <th class="ctr">Подтверждено</th>
          <th>Статус</th>
          <th class="num">Сумма</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="ao-ie-footer">
      <div class="ao-ie-total-line">
        ${CONFIRMED_ORDER_STATUSES.includes(orderStatus) ? 'Итого подтверждено' : 'Подтверждено'}:
        <strong class="ao-confirmed-total">${formatPrice(confirmedTotal)}</strong>
      </div>
      <button class="ao-save-btn" data-order-id="${esc(String(orderId))}">
        Сохранить изменения
      </button>
    </div>`;
}

function _updateLiveTotals(bodyEl) {
  let total = 0;
  bodyEl.querySelectorAll('tr[data-item-id]').forEach(row => {
    const price       = Number(row.dataset.price);
    const weightGrams = Number(row.dataset.weightGrams);
    const val         = Number(row.querySelector('.ao-qty-input')?.value || 0);
    total += price * val;
  });
  const el = bodyEl.querySelector('.ao-confirmed-total');
  if (el) el.textContent = formatPrice(total);
}

function bindItemEvents(bodyEl, orderId) {
  // Numeric input — piece products
  bodyEl.querySelectorAll('.ao-qty-input[type="number"]').forEach(input => {
    input.addEventListener('input', () => {
      const row   = input.closest('tr');
      const req   = Number(row.dataset.req);
      const price = Number(row.dataset.price);
      const val   = Math.max(0, Math.min(req, Math.floor(Number(input.value) || 0)));
      input.value = val;

      const status = calcItemStatus(val, req);
      const cfg    = ITEM_STATUS[status];
      const badge  = row.querySelector('.ao-item-status-badge');
      if (badge) { badge.className = `ao-items-badge ${cfg.cls} ao-item-status-badge`; badge.textContent = cfg.label; }
      row.querySelector('.ao-item-total').textContent = formatPrice(price * val);
      row.className = rowColorClass(val, req);
      _updateLiveTotals(bodyEl);
    });
  });

  // Toggle button — weight products
  bodyEl.querySelectorAll('.ao-weight-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const isNowActive = !btn.classList.contains('active');
      const val         = isNowActive ? 1 : 0;
      btn.classList.toggle('active', isNowActive);
      btn.textContent = isNowActive ? '✓ Есть' : '✗ Нет';

      const row         = btn.closest('tr');
      const price       = Number(row.dataset.price);
      const req         = Number(row.dataset.req);
      const hiddenInput = row.querySelector('.ao-qty-input[type="hidden"]');
      if (hiddenInput) hiddenInput.value = val;

      const status = calcItemStatus(val, req);
      const cfg    = ITEM_STATUS[status];
      const badge  = row.querySelector('.ao-item-status-badge');
      if (badge) { badge.className = `ao-items-badge ${cfg.cls} ao-item-status-badge`; badge.textContent = cfg.label; }
      row.querySelector('.ao-item-total').textContent = formatPrice(price * val);
      row.className = rowColorClass(val, req);
      _updateLiveTotals(bodyEl);
    });
  });

  bodyEl.querySelector('.ao-save-btn')?.addEventListener('click', () => saveItemChanges(orderId, bodyEl));
}

async function saveItemChanges(orderId, bodyEl) {
  const saveBtn = bodyEl.querySelector('.ao-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохраняем…'; }

  try {
    const rows   = [...bodyEl.querySelectorAll('tr[data-item-id]')];
    const updates = rows.map(row => {
      const req         = Number(row.dataset.req);
      const weightGrams = Number(row.dataset.weightGrams);
      const confirmedQty = Math.max(0, Math.min(req, Math.floor(Number(row.querySelector('.ao-qty-input').value) || 0)));
      return {
        itemId:       row.dataset.itemId,
        req,
        price:        Number(row.dataset.price),
        weightGrams,
        isWeight:     weightGrams > 0,
        confirmedQty,
      };
    }).map(u => ({ ...u, itemStatus: calcItemStatus(u.confirmedQty, u.req) }));

    await Promise.all(updates.map(u =>
      updateOrderItem(u.itemId, { confirmedQty: u.confirmedQty, itemStatus: u.itemStatus })
    ));

    const confirmedTotal = updates.reduce((s, u) => s + u.price * u.confirmedQty, 0);
    await updateOrderConfirmedTotal(orderId, confirmedTotal);

    // Update in-memory order
    const order = allOrders.find(o => String(o.id) === String(orderId));
    if (order) order.totalConfirmedAmount = confirmedTotal;

    // Update cache
    const cached = itemsCache.get(orderId);
    if (cached) {
      updates.forEach(u => {
        const item = cached.find(i => String(i.id) === String(u.itemId));
        if (item) { item.confirmedQty = u.confirmedQty; item.itemStatus = u.itemStatus; }
      });
    }

    // If any item is partial/unavailable → order awaits client confirmation
    const hasPartial = updates.some(u => u.confirmedQty < u.req);
    if (hasPartial) {
      await updateOrderStatus(orderId, 'awaiting_client');
      if (order) order.status = 'awaiting_client';
      const cardEl = document.querySelector(`.ao-card[data-id="${String(orderId)}"]`);
      const badge  = cardEl?.querySelector('.ao-card-head .ao-badge');
      if (badge) {
        badge.className  = 'ao-badge ao-s-awaiting';
        badge.textContent = 'Ожидает клиента';
      }
      renderTabs();
    }

    // Telegram notification — fire-and-forget
    _notifyPartialConfirm(orderId, confirmedTotal, cached || [], hasPartial);

    showToast('Сохранено', 'success');
  } catch (err) {
    console.error('[saveItemChanges]', err);
    showToast('Ошибка сохранения', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить изменения'; }
  }
}

function _notifyPartialConfirm(orderId, confirmedTotal, items, needsClientApproval = false) {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order?.userId) return;
  const token = API_CONFIG.TELEGRAM.BOT_TOKEN;
  if (!token) return;

  getClientById(order.userId).then(user => {
    if (!user?.telegramId) return;
    const num = order.orderNumber ?? order.id;

    const lines = items.map(item => {
      const isWeight  = !!item.weightGrams;
      const confirmed = isWeight ? `${item.weightGrams} г × ${item.confirmedQty} порц.` : `${item.confirmedQty} шт`;
      const requested = isWeight ? `${item.weightGrams} г × ${item.requestedQty} порц.` : `${item.requestedQty} шт`;
      if (item.itemStatus === 'confirmed')   return `✅ ${item.productTitleSnapshot} — ${confirmed}`;
      if (item.itemStatus === 'partial')     return `⚠️ ${item.productTitleSnapshot} — доступно только ${confirmed} из ${requested}`;
      if (item.itemStatus === 'unavailable') return `❌ ${item.productTitleSnapshot} — нет в наличии`;
      return `• ${item.productTitleSnapshot} — ${confirmed}`;
    }).join('\n');

    const text =
      `📦 Ваш заказ №${num} обновлён:\n\n` +
      `${lines}\n\n` +
      `💰 Новая сумма:\n${formatPrice(confirmedTotal)}` +
      (needsClientApproval ? `\n\nПожалуйста, подтвердите изменения в личном кабинете.` : '');

    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: user.telegramId, text }),
    }).catch(() => {});
  }).catch(() => {});
}

async function loadItems(orderId, bodyEl) {
  const orderStatus = allOrders.find(o => o.id === orderId)?.status || '';
  if (itemsCache.has(orderId)) {
    renderItemsInto(bodyEl, itemsCache.get(orderId), orderId, orderStatus);
    return;
  }
  try {
    const items = await getOrderItems(orderId);
    itemsCache.set(orderId, items);
    renderItemsInto(bodyEl, items, orderId, orderStatus);
  } catch {
    bodyEl.querySelector('.ao-items-loading').textContent = 'Ошибка загрузки позиций';
  }
}

function renderItemsInto(bodyEl, items, orderId, orderStatus = '') {
  const loadingEl = bodyEl.querySelector('.ao-items-loading');
  if (!loadingEl) return; // already rendered (re-open)
  loadingEl.outerHTML = buildItemsHtml(items, orderId, orderStatus);
  bindItemEvents(bodyEl, orderId);
}

// ── Toggle expand ─────────────────────────────────────────────────────────────

function toggleCard(cardEl, orderId) {
  const isOpen = cardEl.classList.toggle('ao-card--open');
  if (isOpen) {
    const bodyEl = cardEl.querySelector('.ao-card-body');
    loadItems(orderId, bodyEl);
  }
}

// ── Telegram notifications ────────────────────────────────────────────────────

const STATUS_MESSAGES = {
  new:       n        => `🆕 Ваш заказ №${n} создан и ожидает подтверждения`,
  confirmed: n        => `✅ Ваш заказ №${n} подтверждён`,
  preparing: n        => `👨‍🍳 Ваш заказ №${n} готовится`,
  ready:     n        => `🎂 Ваш заказ №${n} готов к получению`,
  completed: n        => `🏁 Заказ №${n} успешно выполнен. Спасибо!`,
  cancelled: (n, r)   => r
    ? `❌ Заказ №${n} отменён\nПричина: ${r}`
    : `❌ Заказ №${n} отменён`,
};

// order must have .telegramId, .orderNumber (or .id), .status, .cancelReason
function sendOrderStatusNotification(order) {
  if (!order.telegramId) return;
  const token = API_CONFIG.TELEGRAM.BOT_TOKEN;
  if (!token) return;

  const num  = order.orderNumber ?? order.id;
  const fn   = STATUS_MESSAGES[order.status];
  if (!fn) return;

  const text = fn(num, order.cancelReason || null);

  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: order.telegramId, text }),
  }).catch(err => console.warn('[notify] Telegram failed:', err.message));
}

// Fetch user's telegramId from MockAPI, then fire notification (fire-and-forget)
function notifyUser(order) {
  if (!order.userId) return;
  getClientById(order.userId)
    .then(user => {
      if (user?.telegramId) {
        sendOrderStatusNotification({ ...order, telegramId: user.telegramId });
      }
    })
    .catch(() => {}); // silent — don't crash status update
}

// ── Cancel reason modal ───────────────────────────────────────────────────────

let _cancelResolve = null;

function injectCancelModal() {
  if (document.getElementById('cancelReasonModal')) return;
  const el = document.createElement('div');
  el.id        = 'cancelReasonModal';
  el.className = 'cr-overlay';
  el.innerHTML = `
    <div class="cr-modal">
      <div class="cr-title">Причина отмены</div>
      <p class="cr-sub">Клиент получит это сообщение в Telegram (необязательно)</p>
      <textarea class="cr-textarea" id="crReasonInput"
        placeholder="Например: нет в наличии чизкейка"
        rows="3" maxlength="300"></textarea>
      <div class="cr-actions">
        <button type="button" class="a-btn a-btn-outline cr-back"   id="crBack">Назад</button>
        <button type="button" class="a-btn cr-confirm" id="crConfirm">Отменить заказ</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('crConfirm').addEventListener('click', () => {
    const reason = document.getElementById('crReasonInput').value.trim();
    el.classList.remove('open');
    if (_cancelResolve) { _cancelResolve(reason); _cancelResolve = null; }
  });

  document.getElementById('crBack').addEventListener('click', () => {
    el.classList.remove('open');
    if (_cancelResolve) { _cancelResolve(false); _cancelResolve = null; }
  });
}

// Returns a string (reason, possibly '') on confirm, false on back
function askCancelReason() {
  injectCancelModal();
  document.getElementById('crReasonInput').value = '';
  document.getElementById('cancelReasonModal').classList.add('open');
  setTimeout(() => document.getElementById('crReasonInput').focus(), 60);
  return new Promise(resolve => { _cancelResolve = resolve; });
}

// ── Status select handler ─────────────────────────────────────────────────────

async function handleStatusChange(selectEl) {
  const id     = selectEl.dataset.id;
  const status = selectEl.value;
  const cardEl = selectEl.closest('.ao-card');
  const order  = allOrders.find(o => o.id === id);
  const prev   = order?.status;

  // Cancellation requires a reason (or confirmation)
  let cancelReason = null;
  if (status === 'cancelled') {
    const result = await askCancelReason();
    if (result === false) {
      selectEl.value = prev; // user clicked Back — revert
      return;
    }
    cancelReason = result || null; // empty string → null
  }

  selectEl.disabled = true;
  try {
    await updateOrderStatus(id, status, cancelReason);

    // Auto-confirm any still-pending items when the order is marked completed
    if (status === 'completed') {
      confirmPendingItems(id).catch(() => {}); // fire-and-forget; non-critical
      // Invalidate cache so re-open will fetch fresh statuses
      itemsCache.delete(id);
    }

    // Update in-memory
    if (order) {
      order.status       = status;
      order.cancelReason = cancelReason;
    }

    // Update badge
    const badgeEl = cardEl.querySelector('.ao-badge');
    if (badgeEl) {
      const cfg = STATUS_CONFIG[status] || { label: status, badge: 'ao-s-new' };
      badgeEl.className  = `ao-badge ${cfg.badge}`;
      badgeEl.textContent = cfg.label;
    }

    // Telegram notification — fire-and-forget
    notifyUser({ ...order, status, cancelReason });

    renderStats();
    renderTabs();
    showToast('Статус обновлён', 'success');
  } catch {
    showToast('Ошибка обновления статуса', 'error');
    if (order) selectEl.value = prev;
  } finally {
    selectEl.disabled = false;
  }
}

// ── Cards rendering ───────────────────────────────────────────────────────────

function getFiltered() {
  const q = searchQuery.toLowerCase();
  return allOrders.filter(o => {
    const matchSearch = !q
      || (o.customerName || '').toLowerCase().includes(q)
      || (o.phone        || '').toLowerCase().includes(q)
      || String(o.orderNumber || '').includes(q);
    const matchFilter = !activeFilter || o.status === activeFilter;
    return matchSearch && matchFilter;
  });
}

function renderCards() {
  if (!cardsEl) return;
  const filtered = getFiltered();
  if (countEl) countEl.textContent = filtered.length;

  if (!filtered.length) {
    cardsEl.innerHTML = `
      <div class="ao-empty">
        <div class="ao-empty-ico">📋</div>
        <div class="ao-empty-text">Заказов нет</div>
        <div class="ao-empty-sub">Попробуйте изменить фильтр или поисковый запрос</div>
      </div>`;
    return;
  }

  cardsEl.innerHTML = filtered.map(order => `
    <div class="ao-card" data-id="${esc(order.id)}">
      ${buildCardHtml(order)}
    </div>`).join('');

  // Wire events
  cardsEl.querySelectorAll('.ao-card-head').forEach(head => {
    head.addEventListener('click', () => {
      toggleCard(head.closest('.ao-card'), head.dataset.id);
    });
  });

  cardsEl.querySelectorAll('.ao-status-select').forEach(sel => {
    sel.addEventListener('change', () => handleStatusChange(sel));
  });
}

// ── Search ────────────────────────────────────────────────────────────────────

searchEl?.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  renderCards();
});

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(message, type = '', onClick = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className  = `a-toast${type ? ' a-toast-' + type : ''}`;
  toast.textContent = message;
  if (onClick) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => { onClick(); toast.remove(); });
  }
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ── Session / logout ──────────────────────────────────────────────────────────

document.getElementById('logoutBtn')?.addEventListener('click', logout);
const session = getSession();
const userEl  = document.getElementById('adminUser');
if (userEl && session) userEl.textContent = session.full_name || session.role;

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  if (cardsEl) cardsEl.innerHTML = createProductSkeletons(3);

  try {
    const _s = getStaffSession();
    const _branchFilter = (['manager', 'operator'].includes(_s?.role) && _s?.branch_id)
      ? _s.branch_id : null;
    allOrders = await getOrders(_branchFilter);
    renderStats();
    renderTabs();
    renderCards();
  } catch (err) {
    if (cardsEl) cardsEl.innerHTML = `
      <div class="ao-empty">
        <div class="ao-empty-ico">❌</div>
        <div class="ao-empty-text">Ошибка загрузки</div>
        <div class="ao-empty-sub">${esc(err.message)}</div>
      </div>`;
    showToast('Ошибка загрузки заказов', 'error');
  }
}

init().then(() => {
  // Orders page is open → mark all admin notifications as read
  markAdminNotifRead();
  // Start polling for new notifications on other pages
  initAdminNotifications();
  // Wire up realtime after initial load
  _initRealtime();
});

// ── Supabase Realtime ─────────────────────────────────────────────────────────

let _rtChannel = null;

async function _initRealtime() {
  let createClient;
  try {
    ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
  } catch {
    return; // CDN unavailable — notifications-service polling covers badge
  }

  const { URL: sbUrl, ANON_KEY } = API_CONFIG.SUPABASE;
  const _sb  = createClient(sbUrl, ANON_KEY);
  const table = API_CONFIG.SUPABASE.TABLES.ORDERS;

  _rtChannel = _sb
    .channel('admin-orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, p => _onNewOrder(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, p => _onUpdatedOrder(p.new))
    .subscribe(status => {
      _updateRealtimeIndicator(status);
      // Auto-reconnect on error
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setTimeout(() => _rtChannel?.subscribe(), 5000);
      }
    });

  window.addEventListener('beforeunload', () => _sb.removeChannel(_rtChannel));
}

function _updateRealtimeIndicator(status) {
  const dot = document.getElementById('realtimeIndicator');
  if (!dot) return;
  dot.className = 'rt-dot';
  if (status === 'SUBSCRIBED') {
    dot.classList.add('rt-dot--on');
    dot.title = 'Realtime подключён';
  } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    dot.classList.add('rt-dot--err');
    dot.title = 'Ошибка — переподключение…';
  } else {
    dot.classList.add('rt-dot--wait');
    dot.title = 'Подключение…';
  }
}

function playNotificationSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* autoplay blocked — silent fail */ }
}

function flashRow(el) {
  el.classList.remove('ao-card--flash');
  void el.offsetWidth; // force reflow so animation restarts
  el.classList.add('ao-card--flash');
  setTimeout(() => el.classList.remove('ao-card--flash'), 2000);
}

function _onNewOrder(row) {
  // Branch filter: managers/operators only see their branch
  const sess = getStaffSession();
  if (['manager', 'operator'].includes(sess?.role) && sess?.branch_id) {
    if (row.branch_id !== sess.branch_id) return;
  }

  const order = fromOrder(row);
  if (allOrders.some(o => o.id === order.id)) return; // duplicate guard

  allOrders.unshift(order);
  renderStats();
  renderTabs();
  renderCards();

  // Flash the newly prepended card
  setTimeout(() => {
    const cardEl = cardsEl?.querySelector(`.ao-card[data-id="${order.id}"]`);
    if (cardEl) flashRow(cardEl);
  }, 50);

  // Clickable toast scrolls to card
  showToast(
    `🆕 Новый заказ #${order.orderNumber ?? ''} — ${order.customerName || 'Клиент'}`,
    'info',
    () => {
      const c = cardsEl?.querySelector(`.ao-card[data-id="${order.id}"]`);
      c?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  );

  playNotificationSound();
}

function _onUpdatedOrder(row) {
  // Branch filter
  const sess = getStaffSession();
  if (['manager', 'operator'].includes(sess?.role) && sess?.branch_id) {
    if (row.branch_id !== sess.branch_id) return;
  }

  const updated = fromOrder(row);
  const idx = allOrders.findIndex(o => o.id === updated.id);
  if (idx === -1) { allOrders.unshift(updated); }
  else            { allOrders[idx] = updated; }

  renderStats();
  renderTabs();

  // Update card in-place (preserves expanded/open state)
  const cardEl = cardsEl?.querySelector(`.ao-card[data-id="${updated.id}"]`);
  if (cardEl) {
    const badgeEl  = cardEl.querySelector('.ao-badge');
    const selectEl = cardEl.querySelector('.ao-status-select');
    const cfg = STATUS_CONFIG[updated.status] || { label: updated.status, badge: 'ao-s-new' };
    if (badgeEl) { badgeEl.className = `ao-badge ${cfg.badge}`; badgeEl.textContent = cfg.label; }
    // Only update select if admin isn't mid-edit
    if (selectEl && !selectEl.disabled) selectEl.value = updated.status;
    flashRow(cardEl);
  } else {
    renderCards();
  }
}
