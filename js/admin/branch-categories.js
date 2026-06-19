// ================================
//  ADMIN — BRANCH CATEGORIES
//  Manages category visibility + popularity per branch
// ================================

import { getStaffSession }                    from './rbac.js';
import { getBranches }                        from '../api/branches-api.js';
import { getCategories, updateCategory }      from '../api/categories-api.js';
import {
  getBranchCategories,
  toggleBranchCategory,
  updateBranchCategoryOrder,
} from '../api/branch-categories-api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'a-toast show' + (isError ? ' a-toast--error' : '');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Render ────────────────────────────────────────────────────────────────────

function _buildBranchSection(branch, allCats, bindingMap) {
  const rows = allCats.map((cat, idx) => {
    const binding   = bindingMap.get(cat.id);
    const isActive  = binding ? binding.is_active : true;
    const isPopular = cat.isPopular || false; // global — same across all branches
    const order     = binding?.sort_order ?? idx;
    return `
      <tr class="bc-row" draggable="true"
          data-branch="${esc(branch.id)}" data-category="${esc(cat.id)}" data-order="${order}">
        <td class="bc-drag-cell" title="Перетащить для изменения порядка">
          <i class="ti ti-grip-vertical"></i>
        </td>
        <td>${esc(cat.title)}</td>
        <td style="width:90px;text-align:center">
          <label class="cl-toggle" title="${isPopular ? 'Показывается на главной' : 'Не отображается на главной'}">
            <input type="checkbox" class="bc-popular" ${isPopular ? 'checked' : ''}>
            <span class="cl-toggle-track"></span>
          </label>
        </td>
        <td style="width:80px;text-align:center">
          <label class="cl-toggle" title="${isActive ? 'Активна в этом филиале' : 'Скрыта в этом филиале'}">
            <input type="checkbox" class="bc-toggle" ${isActive ? 'checked' : ''}>
            <span class="cl-toggle-track"></span>
          </label>
        </td>
      </tr>`;
  }).join('');

  return `
    <details class="bc-branch" open>
      <summary class="bc-branch-summary">
        <span class="bc-branch-name">${esc(branch.name)}</span>
        <span class="bc-branch-addr">${esc(branch.address || '')}</span>
      </summary>
      <div class="bc-branch-body">
        <table class="bc-table">
          <thead>
            <tr>
              <th style="width:36px"></th>
              <th>Категория</th>
              <th style="width:90px;text-align:center">Популярна</th>
              <th style="width:80px;text-align:center">Активна</th>
            </tr>
          </thead>
          <tbody class="bc-tbody" data-branch="${esc(branch.id)}">${rows}</tbody>
        </table>
      </div>
    </details>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

let _changeHandler = null;

export async function initBranchCategoriesTab() {
  const container = document.getElementById('bcContainer');
  if (!container) return;

  container.innerHTML = '<p style="padding:30px;text-align:center;color:var(--a-text-light)">Загрузка…</p>';

  try {
    const session = getStaffSession();
    const [branches, allCats] = await Promise.all([getBranches(), getCategories(true)]);

    if (session?.role === 'manager' && !session?.branch_id) {
      container.innerHTML = '<p style="padding:30px;text-align:center;color:var(--a-text-light)">Ваш филиал не назначен администратором. Обратитесь к администратору.</p>';
      return;
    }

    const visibleBranches = session?.role === 'manager' && session?.branch_id
      ? branches.filter(b => b.id === session.branch_id)
      : branches;

    if (!visibleBranches.length) {
      container.innerHTML = '<p style="padding:30px;text-align:center;color:var(--a-text-light)">Нет доступных филиалов</p>';
      return;
    }

    const bindingResults = await Promise.all(visibleBranches.map(b => getBranchCategories(b.id)));

    const sections = visibleBranches.map((branch, i) => {
      const bindingMap = new Map(bindingResults[i].map(bc => [bc.category_id, bc]));
      return _buildBranchSection(branch, allCats, bindingMap);
    });

    container.innerHTML = sections.join('');
    _attachListeners(container);

  } catch (err) {
    container.innerHTML = `<p style="padding:30px;text-align:center;color:#c0392b">Ошибка: ${esc(err.message)}</p>`;
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────────

function _attachListeners(container) {
  if (_changeHandler) container.removeEventListener('change', _changeHandler);

  _changeHandler = async e => {
    const toggle  = e.target.closest('.bc-toggle');
    const popular = e.target.closest('.bc-popular');
    const chk     = toggle || popular;
    if (!chk) return;

    const row        = chk.closest('.bc-row');
    const branchId   = row.dataset.branch;
    const categoryId = row.dataset.category;
    chk.disabled     = true;

    try {
      if (toggle) {
        await toggleBranchCategory(branchId, categoryId, toggle.checked);
        showToast(toggle.checked ? 'Категория активирована для филиала' : 'Категория скрыта для филиала');
      } else {
        // Popularity is global — updates categories.is_popular for all branches
        await updateCategory(categoryId, { isPopular: popular.checked });
        showToast(popular.checked ? 'Добавлена в популярные на главной' : 'Убрана с главной страницы');
      }
    } catch {
      chk.checked = !chk.checked;
      showToast('Ошибка при обновлении', true);
    } finally {
      chk.disabled = false;
    }
  };

  container.addEventListener('change', _changeHandler);

  _attachDragSort(container);
}

// ── Drag-and-drop sort per branch ─────────────────────────────────────────────

function _attachDragSort(container) {
  let dragSrc   = null;
  let srcTbody  = null;

  container.querySelectorAll('.bc-tbody').forEach(tbody => {
    tbody.addEventListener('dragstart', e => {
      const row = e.target.closest('.bc-row');
      if (!row) return;
      dragSrc  = row;
      srcTbody = tbody;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => row.style.opacity = '0.4', 0);
    });

    tbody.addEventListener('dragover', e => {
      e.preventDefault();
      if (tbody !== srcTbody) return; // block cross-branch drag
      const row = e.target.closest('.bc-row');
      if (!row || row === dragSrc) return;
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        tbody.insertBefore(dragSrc, row);
      } else {
        tbody.insertBefore(dragSrc, row.nextSibling);
      }
    });

    tbody.addEventListener('dragend', async () => {
      if (dragSrc) dragSrc.style.opacity = '';
      const finishedTbody = srcTbody;
      dragSrc  = null;
      srcTbody = null;
      if (finishedTbody) await _saveBranchOrder(finishedTbody);
    });
  });
}

async function _saveBranchOrder(tbody) {
  const rows = Array.from(tbody.querySelectorAll('.bc-row'));
  let hadError = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      await updateBranchCategoryOrder(r.dataset.branch, r.dataset.category, i);
    } catch { hadError = true; }
  }
  hadError ? showToast('Не удалось сохранить порядок', true) : showToast('Порядок сохранён');
}
