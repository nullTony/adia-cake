// ================================
//  ADMIN — ORDER DETAILS
// ================================

import { logout, getSession }              from './auth.js';
import { initRbac }                       from './rbac.js';
import { getOrderById, getOrderItems }     from '../api/orders-api.js';
import { formatPrice, formatDate, esc }   from '../utils/format.js';
import { loadYandexMaps }                 from '../utils/yandex-maps.js';

initRbac('orders');

const STATUS_LABEL = {
  new: 'Новый', confirmed: 'Подтверждён', preparing: 'Готовится',
  ready: 'Готов', completed: 'Выполнен', cancelled: 'Отменён',
  awaiting_client: 'Ожидает клиента', cancelled_by_client: 'Отменён клиентом',
};
const STATUS_BADGE = {
  new: 'a-badge-accent', confirmed: 'a-badge-green', preparing: 'a-badge-amber',
  ready: 'a-badge-green', completed: 'a-badge-gray', cancelled: 'a-badge-red',
  awaiting_client: 'a-badge-amber', cancelled_by_client: 'a-badge-red',
};
const ITEM_STATUS_LABEL = { pending: 'Ожидает', confirmed: 'Подтверждён', partial: 'Частично', unavailable: 'Нет в наличии' };
const ITEM_STATUS_BADGE = { pending: 'a-badge-gray', confirmed: 'a-badge-green', partial: 'a-badge-amber', unavailable: 'a-badge-red' };

const CONFIRMED_ORDER_STATUSES = ['completed', 'ready', 'preparing'];

function getDisplayItemStatus(item, orderStatus) {
  if (item.itemStatus === 'pending' && CONFIRMED_ORDER_STATUSES.includes(orderStatus)) {
    return 'confirmed';
  }
  return item.itemStatus;
}

function statusBadge(status, labelMap, badgeMap) {
  const label = labelMap[status] || status || '—';
  const cls   = badgeMap[status] || 'a-badge-gray';
  return `<span class="a-badge ${cls}">${esc(label)}</span>`;
}

const DELIVERY_LABEL = { delivery: '🚚 Доставка', pickup: '🏪 Самовывоз' };

// ── Render ────────────────────────────────────────────────────────────────────

function renderOrder(order, items) {
  const pickup = order.deliveryType === 'pickup';
  const branchDisplay = order.branchName || order.branchId || '—';
  const hasCoords = !pickup && order.deliveryLat != null && order.deliveryLng != null;
  const ymapsLink = hasCoords
    ? `https://yandex.ru/maps/?pt=${order.deliveryLng},${order.deliveryLat}&z=17&l=map`
    : null;

  const locationRow = pickup
    ? `<div class="a-detail-row"><span class="a-detail-label">Филиал</span><span>${esc(branchDisplay)}</span></div>`
    : `
      <div class="a-detail-row"><span class="a-detail-label">Адрес доставки</span><span>${esc(order.deliveryAddress || '—')}</span></div>
      ${hasCoords ? `
      <div class="a-detail-row" style="align-items:flex-start">
        <span class="a-detail-label">На карте</span>
        <div style="flex:1;min-width:0">
          <div id="odMap" style="width:100%;height:200px;border-radius:8px;overflow:hidden;margin-bottom:8px;border:1px solid var(--a-border)"></div>
          <a href="${ymapsLink}" target="_blank" rel="noopener noreferrer"
             style="font-size:12px;color:var(--a-accent);text-decoration:none;display:inline-flex;align-items:center;gap:4px">
            <i class="ti ti-map-2" style="font-size:14px"></i> Открыть в Яндекс.Картах
          </a>
        </div>
      </div>` : ''}
    `;

  // Total: show confirmed if differs from requested
  const hasConfirmed = order.totalConfirmedAmount > 0 &&
    order.totalConfirmedAmount !== order.totalRequestedAmount;
  const totalLabel = hasConfirmed ? 'Итого подтверждено' : 'Сумма заявки';
  const totalValue = hasConfirmed ? order.totalConfirmedAmount : order.totalRequestedAmount;

  const itemsHtml = items.length ? `
    <table class="a-table">
      <thead>
        <tr>
          <th>Товар</th>
          <th style="text-align:right">Цена</th>
          <th style="text-align:center">Кол-во</th>
          <th style="text-align:right">Сумма</th>
          <th>Статус позиции</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const displayStatus = getDisplayItemStatus(item, order.status);
          const qtyDisplay = item.weightGrams ? `${item.weightGrams} г` : `× ${item.requestedQty}`;
          const itemTotal = item.productPriceSnapshot * item.requestedQty;
          return `
          <tr>
            <td style="font-weight:600">${esc(item.productTitleSnapshot)}</td>
            <td style="text-align:right;white-space:nowrap">${formatPrice(item.productPriceSnapshot)}</td>
            <td style="text-align:center">${qtyDisplay}</td>
            <td style="text-align:right;font-weight:700;white-space:nowrap">${formatPrice(itemTotal)}</td>
            <td>${statusBadge(displayStatus, ITEM_STATUS_LABEL, ITEM_STATUS_BADGE)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : `
    <div class="a-empty">
      <div class="a-empty-text">Позиции заказа не найдены</div>
    </div>`;

  return `
    <div style="display:grid;gap:20px">

      <!-- Order info card -->
      <div class="a-card" style="background:var(--a-white);border:1px solid var(--a-border);border-radius:var(--a-r-lg);padding:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--a-text-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Заказ</div>
            <div style="font-size:22px;font-weight:800">#${order.orderNumber ?? '—'}</div>
          </div>
          ${statusBadge(order.status, STATUS_LABEL, STATUS_BADGE)}
        </div>

        <div class="a-detail-grid">
          <div class="a-detail-row"><span class="a-detail-label">Клиент</span><span style="font-weight:600">${esc(order.customerName)}</span></div>
          <div class="a-detail-row"><span class="a-detail-label">Телефон</span><a href="tel:${esc(order.phone)}" style="color:var(--a-accent)">${esc(order.phone)}</a></div>
          <div class="a-detail-row"><span class="a-detail-label">Доставка</span><span>${esc(DELIVERY_LABEL[order.deliveryType] || order.deliveryType)}</span></div>
          ${locationRow}
          ${order.comment ? `<div class="a-detail-row"><span class="a-detail-label">Комментарий</span><span style="color:var(--a-text-med)">${esc(order.comment)}</span></div>` : ''}
          <div class="a-detail-row"><span class="a-detail-label">Дата</span><span style="color:var(--a-text-med)">${formatDate(order.createdAt)}</span></div>
          <div class="a-detail-row"><span class="a-detail-label">${esc(totalLabel)}</span><span style="font-weight:800;font-size:16px">${formatPrice(totalValue)}</span></div>
        </div>
      </div>

      <!-- Items card -->
      <div class="a-card" style="background:var(--a-white);border:1px solid var(--a-border);border-radius:var(--a-r-lg);overflow:hidden">
        <div style="padding:18px 24px;border-bottom:1px solid var(--a-border);font-weight:700">
          Состав заказа (${items.length})
        </div>
        <div class="a-table-wrap" style="border-radius:0;box-shadow:none;border:none">
          ${itemsHtml}
        </div>
      </div>

    </div>`;
}

// ── CSS helpers injected into admin.css scope ─────────────────────────────────

function injectDetailStyles() {
  if (document.getElementById('od-styles')) return;
  const style = document.createElement('style');
  style.id = 'od-styles';
  style.textContent = `
    .a-detail-grid { display: flex; flex-direction: column; gap: 12px; }
    .a-detail-row  { display: flex; align-items: baseline; gap: 12px; font-size: 14px; }
    .a-detail-label { min-width: 140px; font-size: 12px; font-weight: 700; color: var(--a-text-light); text-transform: uppercase; letter-spacing: 0.4px; flex-shrink: 0; }
  `;
  document.head.appendChild(style);
}

// ── Session / logout ──────────────────────────────────────────────────────────

document.getElementById('logoutBtn')?.addEventListener('click', logout);
const session = getSession();
const userEl  = document.getElementById('adminUser');
if (userEl && session) userEl.textContent = session.full_name || session.role;

// ── Admin delivery map (read-only) ────────────────────────────────────────────

async function _initAdminMap(lat, lng) {
  const container = document.getElementById('odMap');
  if (!container) return;
  const ymaps = await loadYandexMaps();
  const map = new ymaps.Map(container, { center: [lat, lng], zoom: 16, controls: [] }, {
    suppressMapOpenBlock: true,
  });
  map.behaviors.disable(['drag', 'scrollZoom', 'dblClickZoom', 'multiTouch', 'rightMouseButtonMagnifier']);
  map.geoObjects.add(new ymaps.Placemark([lat, lng], {}, { preset: 'islands#redDotIcon' }));
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const id = new URLSearchParams(window.location.search).get('id');
  const contentEl = document.getElementById('orderContent');
  const titleEl   = document.getElementById('pageTitle');

  if (!id) {
    if (contentEl) contentEl.innerHTML = `<div class="a-empty"><div class="a-empty-ico">❌</div><div class="a-empty-text">Заказ не найден</div></div>`;
    return;
  }

  injectDetailStyles();

  try {
    const [order, items] = await Promise.all([
      getOrderById(id),
      getOrderItems(id),
    ]);

    if (!order) {
      if (contentEl) contentEl.innerHTML = `<div class="a-empty"><div class="a-empty-ico">❌</div><div class="a-empty-text">Заказ #${esc(id)} не найден</div></div>`;
      return;
    }

    const displayNum = order.orderNumber ?? '—';
    if (titleEl) titleEl.textContent = `Заказ #${displayNum}`;
    document.title = `Заказ #${displayNum} — ADIA Cake Admin`;
    if (contentEl) contentEl.innerHTML = renderOrder(order, items);

    if (order.deliveryType === 'delivery' && order.deliveryLat != null && order.deliveryLng != null) {
      _initAdminMap(order.deliveryLat, order.deliveryLng).catch(() => {});
    }

  } catch (err) {
    if (contentEl) contentEl.innerHTML = `
      <div style="text-align:center;color:var(--a-danger);padding:60px 0">
        Ошибка загрузки: ${esc(err.message)}
      </div>`;
  }
}

init();
