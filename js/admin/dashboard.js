// ================================
//  ADMIN — DASHBOARD
// ================================

import { logout, getSession }                from './auth.js';
import { initRbac }                          from './rbac.js';
import { getOrders }                        from '../api/orders-api.js';

initRbac('dashboard');

document.getElementById('logoutBtn')?.addEventListener('click', logout);

const session = getSession();
const userEl  = document.getElementById('adminUser');
if (userEl && session) userEl.textContent = session.full_name || session.role;

// ---- Date header ----

const dateEl = document.getElementById('dashDate');
if (dateEl) {
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ---- Helpers ----

function formatPrice(n) {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';
}

function todayPrefix() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

const STATUS_LABEL = {
  new:                'Новый',
  confirmed:          'Подтверждён',
  awaiting_client:    'Ожидает клиента',
  preparing:          'Готовится',
  ready:              'Готов',
  completed:          'Выполнен',
  cancelled:          'Отменён',
  cancelled_by_client:'Отменён клиентом',
};

function statusBadge(status) {
  return `<span class="db-status db-status--${status || 'new'}">${STATUS_LABEL[status] || status}</span>`;
}

function deliveryLabel(type) {
  return type === 'pickup' ? 'Самовывоз' : 'Доставка';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ---- Render stats ----

function renderStats(orders) {
  const today = todayPrefix();
  const todayOrders   = orders.filter(o => (o.createdAt || '').startsWith(today));
  const pendingOrders = orders.filter(o => o.status === 'new');
  const todayRevenue  = todayOrders
    .filter(o => o.status !== 'cancelled' && o.status !== 'cancelled_by_client')
    .reduce((sum, o) => sum + (o.totalConfirmedAmount || o.totalRequestedAmount || 0), 0);

  const el = id => document.getElementById(id);
  if (el('statNewToday')) el('statNewToday').textContent = todayOrders.length;
  if (el('statPending'))  el('statPending').textContent  = pendingOrders.length;
  if (el('statRevenue'))  el('statRevenue').textContent  = formatPrice(todayRevenue);
  if (el('statTotal'))    el('statTotal').textContent    = orders.length;
}

// ---- Render recent orders table ----

function renderRecentOrders(orders) {
  const tbody  = document.getElementById('recentOrdersTbody');
  const emptyEl = document.getElementById('recentOrdersEmpty');
  if (!tbody) return;

  const recent = orders.slice(0, 10);
  if (!recent.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  tbody.innerHTML = recent.map(o => `
    <tr data-order-id="${o.id}" onclick="location.href='order-details.html?id=${o.id}'" title="Открыть заказ">
      <td style="font-weight:700">#${o.orderNumber ?? '—'}</td>
      <td>
        <div style="font-weight:600">${o.customerName || '—'}</div>
        <div style="font-size:12px;color:var(--a-text-light)">${o.phone || ''}</div>
      </td>
      <td style="white-space:nowrap;font-weight:600">${formatPrice(o.totalConfirmedAmount || o.totalRequestedAmount)}</td>
      <td>${deliveryLabel(o.deliveryType)}</td>
      <td>${statusBadge(o.status)}</td>
      <td style="white-space:nowrap;font-size:13px;color:var(--a-text-light)">${fmtDate(o.createdAt)}</td>
    </tr>`).join('');
}

// ---- Init ----

async function init() {
  try {
    const orders = await getOrders();
    renderStats(orders);
    renderRecentOrders(orders);
  } catch (err) {
    const tbody = document.getElementById('recentOrdersTbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--a-danger)">Ошибка загрузки: ${err.message}</td></tr>`;
  }
}

init();
