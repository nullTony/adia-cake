// ================================
//  ADMIN — PRODUCTS LIST
// ================================

import { logout, getSession }                       from './auth.js';
import { initRbac }                                 from './rbac.js';
import { getProducts, deleteProduct, updateProduct } from '../api/products-api.js';
import { CATEGORIES }                               from '../modules/product-card.js';
import { initAdminNotifications }                   from '../services/notification-service.js';
import { getCategories }                            from '../api/categories-api.js';
import { clearProductFromBranches }                 from '../api/branch-products-api.js';
import { createTableSkeletons }                     from '../utils/skeleton.js';

initRbac('products');
initAdminNotifications();

// ---- DOM refs ----
const tbody     = document.getElementById('productsBody');
const searchEl  = document.getElementById('searchInput');
const catFilter = document.getElementById('catFilter');
const emptyEl   = document.getElementById('emptyState');
const countEl   = document.getElementById('productsCount');
const logoutBtn = document.getElementById('logoutBtn');
const statsRow  = document.getElementById('statsRow');

const modalBackdrop    = document.getElementById('confirmModal');
const modalText        = document.getElementById('confirmModalText');
const confirmOkBtn     = document.getElementById('confirmOk');
const confirmCancelBtn = document.getElementById('confirmCancel');

// ---- State ----
let allProducts     = [];
let categoryMap     = { ...CATEGORIES }; // slug → title, merged with API
let pendingDeleteId = null;
let searchQuery     = '';
let activeCat       = '';
let currentFilter   = 'active'; // 'all' | 'active' | 'archived'

// ---- Helpers ----

function formatPrice(price) {
  return String(Math.round(price || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';
}

// ---- Stats ----

function renderStats() {
  if (!statsRow) return;
  const total    = allProducts.length;
  const active   = allProducts.filter(p => p.inStock !== false).length;
  const archived = allProducts.filter(p => p.inStock === false).length;
  statsRow.innerHTML = `
    <div class="a-stat-card">
      <div class="a-stat-label">Всего товаров</div>
      <div class="a-stat-val">${total}</div>
    </div>
    <div class="a-stat-card">
      <div class="a-stat-label">Активных</div>
      <div class="a-stat-val">${active}</div>
    </div>
    <div class="a-stat-card">
      <div class="a-stat-label">В архиве</div>
      <div class="a-stat-val">${archived}</div>
    </div>`;
}

// ---- Table ----

function renderTable() {
  const filtered = allProducts.filter(p => {
    const matchSearch = !searchQuery
      || (p.title || '').toLowerCase().includes(searchQuery)
      || (p.description || '').toLowerCase().includes(searchQuery);
    const matchCat    = !activeCat || p.category === activeCat;
    const matchStock  = currentFilter === 'all'
      || (currentFilter === 'active'   && p.inStock !== false)
      || (currentFilter === 'archived' && p.inStock === false);
    return matchSearch && matchCat && matchStock;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    emptyEl?.style && (emptyEl.style.display = '');
    return;
  }
  emptyEl?.style && (emptyEl.style.display = 'none');

  tbody.innerHTML = filtered.map(p => {
    const catLabel = categoryMap[p.category] || p.category || '—';
    const thumb    = p.photo
      ? `<img class="a-prod-thumb" src="${p.photo}" alt="${p.title}" onerror="this.style.display='none'">`
      : `<div class="a-prod-thumb" style="background:var(--a-bg-2);border-radius:6px;flex-shrink:0"></div>`;
    const statusBadge = p.inStock !== false
      ? '<span class="a-badge a-badge-green">В наличии</span>'
      : '<span class="a-badge a-badge-gray">Архив</span>';

    const activeChecked = p.inStock !== false ? 'checked' : '';

    return `
      <tr data-product-id="${p.id}">
        <td>
          <div class="a-prod-thumb-wrap">
            ${thumb}
            <div>
              <div class="a-prod-name">${p.title || '—'}</div>
              <div class="a-prod-desc">${p.description || '—'}</div>
            </div>
          </div>
        </td>
        <td><span class="a-badge a-badge-gray">${catLabel}</span></td>
        <td style="font-weight:700;white-space:nowrap">${formatPrice(p.price)}</td>
        <td>${statusBadge}</td>
        <td>
          <label class="a-toggle">
            <input type="checkbox" data-toggle-active="${p.id}" ${activeChecked}>
            <span class="a-toggle-slider"></span>
          </label>
        </td>
        <td>
          <div class="a-actions">
            <a href="product-form.html?id=${p.id}" class="a-btn a-btn-outline a-btn-sm a-btn-icon" title="Редактировать">
              <i class="ti ti-pencil"></i>
            </a>
            <button class="a-btn a-btn-outline a-btn-sm a-btn-icon"
                    data-delete="${p.id}" data-title="${p.title}"
                    title="Удалить"
                    style="color:var(--a-danger);border-color:var(--a-danger-light)">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ---- Filters ----

searchEl?.addEventListener('input', e => {
  searchQuery = e.target.value.toLowerCase().trim();
  renderTable();
});

catFilter?.addEventListener('change', e => {
  activeCat = e.target.value;
  renderTable();
});

document.getElementById('stockFilter')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  document.querySelectorAll('#stockFilter .a-filter-btn').forEach(b =>
    b.classList.toggle('a-filter-btn--active', b === btn)
  );
  renderTable();
});

// ---- Inline active toggle ----

document.addEventListener('change', async e => {
  const toggle = e.target.closest('[data-toggle-active]');
  if (!toggle) return;
  const id     = toggle.dataset.toggleActive;
  const active = toggle.checked;
  try {
    await updateProduct(id, { inStock: active });
    if (!active) await clearProductFromBranches(id);
    const product = allProducts.find(p => String(p.id) === String(id));
    if (product) product.inStock = active;
    renderStats();
    renderTable();
    showToast(active ? 'Товар активирован' : 'Товар перемещён в архив', 'success');
  } catch (err) {
    toggle.checked = !active;
    showToast('Ошибка: ' + err.message, 'error');
  }
});

// ---- Delete ----

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-delete]');
  if (!btn) return;
  pendingDeleteId = btn.dataset.delete;
  if (modalText) modalText.textContent = `Удалить «${btn.dataset.title}»? Это действие нельзя отменить.`;
  modalBackdrop?.classList.add('open');
});

confirmOkBtn?.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  pendingDeleteId = null;
  modalBackdrop?.classList.remove('open');
  try {
    await deleteProduct(id);
    allProducts = allProducts.filter(p => String(p.id) !== String(id));
    renderStats();
    renderTable();
    showToast('Товар удалён', 'success');
  } catch (err) {
    showToast('Ошибка удаления: ' + err.message, 'error');
  }
});

confirmCancelBtn?.addEventListener('click', () => {
  pendingDeleteId = null;
  modalBackdrop?.classList.remove('open');
});

modalBackdrop?.addEventListener('click', e => {
  if (e.target === modalBackdrop) {
    pendingDeleteId = null;
    modalBackdrop.classList.remove('open');
  }
});

// ---- Logout / session ----

logoutBtn?.addEventListener('click', logout);

const session = getSession();
const userEl  = document.getElementById('adminUser');
if (userEl && session) userEl.textContent = session.full_name || session.role;

// ---- Toast ----

function showToast(message, type = '') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className  = `a-toast${type ? ' a-toast-' + type : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---- Init ----

async function loadCategoryFilter() {
  try {
    const cats = await getCategories(false);
    cats.forEach(cat => {
      categoryMap[cat.slug] = cat.title;
      if (catFilter) {
        const opt = document.createElement('option');
        opt.value       = cat.slug;
        opt.textContent = cat.title;
        catFilter.appendChild(opt);
      }
    });
  } catch { /* keep static map + "Все категории" only */ }
}

async function init() {
  if (tbody) tbody.innerHTML = createTableSkeletons(5, 6);
  try {
    [allProducts] = await Promise.all([getProducts(), loadCategoryFilter()]);
    renderStats();
    renderTable();
  } catch (err) {
    if (tbody) tbody.innerHTML = `
      <tr><td colspan="6" style="text-align:center;color:var(--a-danger);padding:32px">
        Ошибка загрузки: ${err.message}
      </td></tr>`;
  }

  if (new URLSearchParams(window.location.search).get('saved') === '1') {
    history.replaceState({}, '', 'products.html');
    setTimeout(() => showToast('Товар сохранён', 'success'), 100);
  }
}

init();
