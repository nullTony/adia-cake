// ================================
//  ADMIN — BRANCH PRODUCTS (Phase 2)
//  Each morning manager marks which products are available today
//  and which are featured on the homepage (top 4).
// ================================

import { logout, getSession }                    from './auth.js';
import { initRbac }                              from './rbac.js';
import { getBranches }                           from '../api/branches-api.js';
import { getProducts }                           from '../api/products-api.js';
import { getBranchProductsAdmin,
         upsertBranchProducts }                  from '../api/branch-products-api.js';

initRbac('branch_products');

document.getElementById('logoutBtn')?.addEventListener('click', logout);
const _session = getSession();
const _userEl  = document.getElementById('adminUser');
if (_userEl && _session) _userEl.textContent = _session.full_name || _session.role;

// ── State ─────────────────────────────────────────────────────────────────────

let _branches   = [];
let _products   = []; // all global products (in_stock = true), sorted
let _state      = {}; // productId → { is_available_today, is_popular, showcase_order }
let _filtered   = []; // current display list (after search filter)
let _branchId   = null;
let _hasChanges = false;

const _BRANCH_KEY = 'adia_admin_selected_branch';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtPrice(n) {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const dateEl = document.getElementById('bpDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('ru-RU', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  }

  try {
    _branches = await getBranches();
  } catch (err) {
    _setContent(`<div class="bp-empty">Ошибка загрузки филиалов: ${esc(err.message)}</div>`);
    return;
  }

  try {
    const all = await getProducts();
    _products = all.filter(p => p.inStock !== false);
  } catch (err) {
    _setContent(`<div class="bp-empty">Ошибка загрузки товаров: ${esc(err.message)}</div>`);
    return;
  }

  const isManager     = _session?.role === 'manager';
  const staffBranchId = _session?.branch_id;

  if (isManager) {
    document.getElementById('bpBranchRow').style.display = 'none';
    const branchObj = _branches.find(b => b.id === staffBranchId);
    const staticEl  = document.getElementById('bpManagerBranch');
    if (staticEl) {
      staticEl.textContent = `Ваш филиал: ${branchObj?.name || '—'}`;
      staticEl.hidden = false;
    }
    if (!staffBranchId) {
      _setContent('<div class="bp-empty">Вашему аккаунту не назначен филиал. Обратитесь к управляющему.</div>');
      return;
    }
    _branchId = staffBranchId;
    await _loadBranch(_branchId);
  } else {
    _populateBranchSelect();

    // Restore last selected branch
    try {
      const saved = JSON.parse(localStorage.getItem(_BRANCH_KEY));
      if (saved?.id) {
        const sel = document.getElementById('bpBranch');
        sel.value = saved.id;
        if (sel.value === saved.id) {
          _branchId = saved.id;
          await _loadBranch(_branchId);
        } else {
          // Branch no longer exists — clear stale key
          localStorage.removeItem(_BRANCH_KEY);
        }
      }
    } catch {}

    document.getElementById('bpBranch').addEventListener('change', async e => {
      _branchId = e.target.value || null;
      if (_branchId) {
        const sel = e.target;
        localStorage.setItem(_BRANCH_KEY, JSON.stringify({
          id:   _branchId,
          name: sel.options[sel.selectedIndex]?.text || '',
        }));
        await _loadBranch(_branchId);
      } else {
        _setContent('<div class="bp-empty">Выберите филиал</div>');
      }
    });
  }

  document.getElementById('bpSearch').addEventListener('input', e => _applySearch(e.target.value));
  document.getElementById('bpSaveBtn').addEventListener('click', _save);
}

function _populateBranchSelect() {
  const sel = document.getElementById('bpBranch');
  _branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value       = b.id;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

// ── Load branch ───────────────────────────────────────────────────────────────

async function _loadBranch(branchId) {
  _setContent('<div class="bp-loading">Загрузка…</div>');
  _hasChanges = false;
  _setSaveVisible(false);

  let bpRows;
  try {
    bpRows = await getBranchProductsAdmin(branchId);
  } catch (err) {
    _setContent(`<div class="bp-empty">Ошибка загрузки: ${esc(err.message)}</div>`);
    return;
  }

  // Index branch_products rows by product_id
  const bpMap = {};
  bpRows.forEach(r => { bpMap[r.product_id] = r; });

  // Build in-memory state for every global product
  _state = {};
  _products.forEach((p, idx) => {
    const bp = bpMap[p.id];
    _state[p.id] = {
      is_available_today: bp?.is_available_today ?? false,
      is_popular:         bp?.is_popular         ?? false,
      showcase_order:     bp?.showcase_order      ?? idx,
    };
  });

  _filtered = [..._products];
  const searchEl = document.getElementById('bpSearch');
  if (searchEl) searchEl.value = '';
  _renderTable();
}

// ── Render ────────────────────────────────────────────────────────────────────

function _renderTable() {
  const wrap = document.getElementById('bpTableWrap');
  if (!wrap) return;

  _updateCounters();

  if (!_filtered.length) {
    wrap.innerHTML = '<div class="bp-empty">Нет товаров по запросу</div>';
    return;
  }

  const rows = _filtered.map(p => {
    const st      = _state[p.id];
    const avail   = st.is_available_today;
    const popular = st.is_popular;

    const img = p.photo
      ? `<img class="bp-prod-img" src="${esc(p.photo)}" alt="${esc(p.title)}">`
      : `<div class="bp-prod-img-ph">🎂</div>`;

    return `
      <tr data-pid="${esc(p.id)}">
        <td>
          <div class="bp-prod-cell">
            ${img}
            <div>
              <div class="bp-prod-name">${esc(p.title)}</div>
              <div class="bp-prod-price">${fmtPrice(p.price)}</div>
            </div>
          </div>
        </td>
        <td class="bp-check-cell">
          <label class="bp-switch">
            <input type="checkbox" class="bp-avail-chk" data-pid="${esc(p.id)}" ${avail ? 'checked' : ''}>
            <span class="bp-slider"></span>
          </label>
        </td>
        <td class="bp-check-cell">
          <label class="bp-switch${!avail ? ' bp-switch--disabled' : ''}">
            <input type="checkbox" class="bp-pop-chk" data-pid="${esc(p.id)}"
                   ${popular ? 'checked' : ''} ${!avail ? 'disabled' : ''}>
            <span class="bp-slider bp-slider--pop"></span>
          </label>
        </td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="bp-table">
      <thead>
        <tr>
          <th>Товар</th>
          <th class="bp-check-head">Есть сегодня</th>
          <th class="bp-check-head">Топ</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  _wireTableEvents();
}

// ── Toggle events ─────────────────────────────────────────────────────────────

function _wireTableEvents() {
  document.querySelectorAll('.bp-avail-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const pid = chk.dataset.pid;
      const val = chk.checked;
      _state[pid].is_available_today = val;
      if (!val) _state[pid].is_popular = false;

      // Sync popular toggle in same row
      const row    = chk.closest('tr');
      const popChk = row?.querySelector('.bp-pop-chk');
      if (popChk) {
        popChk.checked  = _state[pid].is_popular;
        popChk.disabled = !val;
        popChk.closest('label')?.classList.toggle('bp-switch--disabled', !val);
      }

      _updateCounters();
      _markChanged();
    });
  });

  document.querySelectorAll('.bp-pop-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const pid = chk.dataset.pid;
      if (!_state[pid].is_available_today) {
        chk.checked = false;
        showToast('Сначала отметьте товар как доступный сегодня', true);
        return;
      }
      _state[pid].is_popular = chk.checked;
      _updateCounters();
      _markChanged();

      const popCount = Object.values(_state).filter(s => s.is_popular).length;
      if (popCount > 4) showToast('Рекомендуется не более 4 топ-позиций', true);
    });
  });
}

// ── Search ────────────────────────────────────────────────────────────────────

function _applySearch(query) {
  const q = (query || '').toLowerCase().trim();
  _filtered = q
    ? _products.filter(p => p.title.toLowerCase().includes(q))
    : [..._products];
  _renderTable();
}

// ── Counters ──────────────────────────────────────────────────────────────────

function _updateCounters() {
  const vals        = Object.values(_state);
  const availCount  = vals.filter(s => s.is_available_today).length;
  const popCount    = vals.filter(s => s.is_popular).length;
  const availEl     = document.getElementById('bpAvailCount');
  const popEl       = document.getElementById('bpPopularCount');
  if (availEl) availEl.textContent = availCount;
  if (popEl)   popEl.textContent   = popCount;
}

// ── Save (batch upsert) ───────────────────────────────────────────────────────

async function _save() {
  if (!_branchId) return;
  const btn = document.getElementById('bpSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }

  const items = _products.map(p => ({
    productId:        p.id,
    isAvailableToday: _state[p.id].is_available_today,
    isPopular:        _state[p.id].is_popular,
    showcaseOrder:    _state[p.id].showcase_order,
  }));

  try {
    await upsertBranchProducts(_branchId, items);
    _hasChanges = false;
    _setSaveVisible(false);
    showToast('Витрина сохранена ✓');
  } catch (err) {
    showToast('Ошибка сохранения: ' + err.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить изменения'; }
  }
}

function _markChanged() {
  if (!_hasChanges) {
    _hasChanges = true;
    _setSaveVisible(true);
  }
}

function _setSaveVisible(show) {
  document.getElementById('bpSaveBar')?.classList.toggle('bp-save-bar--visible', show);
}

// ── Util ──────────────────────────────────────────────────────────────────────

function _setContent(html) {
  const wrap = document.getElementById('bpTableWrap');
  if (wrap) wrap.innerHTML = html;
  const a = document.getElementById('bpAvailCount');
  const p = document.getElementById('bpPopularCount');
  if (a) a.textContent = '—';
  if (p) p.textContent = '—';
}

function showToast(msg, isError = false) {
  const t = document.getElementById('bpToast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'a-toast show' + (isError ? ' a-toast--error' : '');
  setTimeout(() => t.classList.remove('show'), 3000);
}

init();
