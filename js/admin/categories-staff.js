// ================================
//  ADMIN — CATEGORIES (STAFF VIEW)
//  Combined panel for operator/staff roles.
//  No separate tabs — drag-sort + popularity + full CRUD in one table.
//  Branch-specific controls (popularity, active, order) are scoped to staff's branch.
// ================================

import { getStaffSession }           from './rbac.js';
import {
  getCategories, createCategory, updateCategory,
  deleteCategory, countProductsInCategory,
} from '../api/categories-api.js';
import {
  getBranchCategories,
  toggleBranchCategory,
  updateBranchCategoryOrder,
} from '../api/branch-categories-api.js';
import { uploadImage, isImgBBConfigured } from '../api/image-upload-api.js';

// ── Slug generator ────────────────────────────────────────────────────────────

function generateSlug(title) {
  const map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
    'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
    'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts',
    'ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
  };
  return (title || '').toLowerCase()
    .split('').map(c => map[c] || c).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Module state ──────────────────────────────────────────────────────────────

let _all        = [];   // global categories (sorted by branch binding order)
let _bindings   = [];   // branch_categories rows for staff's branch
let _branchId   = null;
let _editId     = null;
let _imgModalId = null;
let _dragSrc    = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _getBinding(catId) {
  return _bindings.find(b => b.category_id === catId) || null;
}

function _showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'a-toast show' + (isError ? ' a-toast--error' : '');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Render ────────────────────────────────────────────────────────────────────

function _renderTable() {
  const tbody = document.getElementById('scTbody');
  const empty = document.getElementById('scEmpty');
  const count = document.getElementById('scCount');
  if (!tbody) return;

  count.textContent = _all.length;

  if (!_all.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // Sort by branch sort_order when available
  const sorted = [..._all].sort((a, b) => {
    const oa = _getBinding(a.id)?.sort_order ?? a.sortOrder;
    const ob = _getBinding(b.id)?.sort_order ?? b.sortOrder;
    return oa - ob;
  });

  tbody.innerHTML = sorted.map((cat, i) => {
    if (_editId === cat.id) return _buildEditRow(cat);
    return _buildViewRow(cat, i);
  }).join('');
}

function _buildViewRow(cat, index) {
  const isActive  = cat.isActive;           // global categories.is_active
  const isPopular = cat.isPopular || false; // global categories.is_popular

  const thumbInner = cat.imageUrl
    ? `<div class="cat-thumb"><img src="${esc(cat.imageUrl)}" alt="${esc(cat.title)}"></div>`
    : `<div class="cat-thumb cat-thumb--empty"><i class="ti ti-photo"></i><span>Нет фото</span></div>`;

  const popover = cat.imageUrl
    ? `<div class="cat-thumb-popover"><img src="${esc(cat.imageUrl)}" alt="${esc(cat.title)}"></div>`
    : '';

  return `
    <tr data-id="${esc(cat.id)}" draggable="true">
      <td class="bc-drag-cell" title="Перетащить для изменения порядка">
        <i class="ti ti-grip-vertical"></i>
        <span style="font-size:11px;color:var(--a-text-light);margin-left:2px">${index + 1}</span>
      </td>
      <td style="font-weight:600">${esc(cat.title)}</td>
      <td><code style="font-size:12px;color:var(--a-text-light)">${esc(cat.slug)}</code></td>
      <td class="cat-thumb-col">
        <div class="cat-img-cell">
          <button class="a-btn a-btn-outline cat-image-btn" data-id="${esc(cat.id)}" title="Изменить фото">
            ${thumbInner}
          </button>
          ${popover}
        </div>
      </td>
      <td style="text-align:center">
        <label class="cl-toggle" title="${isPopular ? 'Показывается на главной' : 'Не на главной'}">
          <input type="checkbox" class="sc-popular" data-id="${esc(cat.id)}" ${isPopular ? 'checked' : ''}>
          <span class="cl-toggle-track"></span>
        </label>
      </td>
      <td style="text-align:center">
        <label class="cl-toggle" title="${isActive ? 'Активна' : 'Скрыта'}">
          <input type="checkbox" class="sc-active" data-id="${esc(cat.id)}" ${isActive ? 'checked' : ''}>
          <span class="cl-toggle-track"></span>
        </label>
      </td>
      <td>
        <div class="a-actions">
          <button class="a-btn a-btn-outline a-btn-sm a-btn-icon sc-edit-btn" data-id="${esc(cat.id)}" title="Редактировать">
            <i class="ti ti-pencil"></i>
          </button>
          <button class="a-btn a-btn-outline a-btn-sm a-btn-icon sc-delete-btn"
              data-id="${esc(cat.id)}" data-slug="${esc(cat.slug)}" data-title="${esc(cat.title)}"
              title="Удалить" style="color:var(--a-danger);border-color:var(--a-danger-light)">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
}

function _buildEditRow(cat) {
  return `
    <tr data-id="${esc(cat.id)}" class="cat-edit-row">
      <td class="bc-drag-cell"></td>
      <td><input class="a-input" id="scEditTitle" value="${esc(cat.title)}" placeholder="Название" style="padding:6px 10px;font-size:13px"></td>
      <td><input class="a-input" id="scEditSlug"  value="${esc(cat.slug)}"  placeholder="slug"     style="padding:6px 10px;font-size:13px;font-family:monospace"></td>
      <td colspan="3">—</td>
      <td>
        <div class="a-actions">
          <button class="a-btn a-btn-accent a-btn-sm sc-save-btn" data-id="${esc(cat.id)}">Сохранить</button>
          <button class="a-btn a-btn-outline a-btn-sm sc-cancel-btn">Отмена</button>
        </div>
      </td>
    </tr>`;
}

// ── Add row ───────────────────────────────────────────────────────────────────

function _showAddRow() {
  const existing = document.getElementById('scAddRow');
  if (existing) { existing.querySelector('#scAddTitle')?.focus(); return; }

  const tbody = document.getElementById('scTbody');
  const tr = document.createElement('tr');
  tr.id = 'scAddRow';
  tr.className = 'cat-edit-row';
  tr.innerHTML = `
    <td class="bc-drag-cell"></td>
    <td><input class="a-input" id="scAddTitle" placeholder="Название*" style="padding:6px 10px;font-size:13px"></td>
    <td><input class="a-input" id="scAddSlug"  placeholder="slug (авто)" style="padding:6px 10px;font-size:13px;font-family:monospace"></td>
    <td colspan="3">—</td>
    <td>
      <div class="a-actions">
        <button class="a-btn a-btn-accent a-btn-sm" id="scAddSaveBtn">Добавить</button>
        <button class="a-btn a-btn-outline a-btn-sm" id="scAddCancelBtn">Отмена</button>
      </div>
    </td>`;
  tbody.appendChild(tr);

  const titleEl = document.getElementById('scAddTitle');
  const slugEl  = document.getElementById('scAddSlug');
  titleEl.focus();
  titleEl.addEventListener('input', () => {
    if (!slugEl.dataset.manual) slugEl.value = generateSlug(titleEl.value);
  });
  slugEl.addEventListener('input', () => { slugEl.dataset.manual = '1'; });

  document.getElementById('scAddSaveBtn').addEventListener('click', async () => {
    const title = titleEl.value.trim();
    const slug  = slugEl.value.trim() || generateSlug(title);
    if (!title) { titleEl.focus(); _showToast('Введите название категории', true); return; }
    const btn = document.getElementById('scAddSaveBtn');
    btn.disabled = true;
    try {
      const cat = await createCategory({ title, slug, sortOrder: _all.length, isActive: true });
      if (cat) {
        _all.push(cat);
        // Bind to staff's branch if available
        if (_branchId) {
          const binding = await toggleBranchCategory(_branchId, cat.id, true);
          if (binding) _bindings.push(binding);
        }
      }
      tr.remove();
      _renderTable();
      _showToast('Категория добавлена');
    } catch (err) {
      _showToast('Ошибка: ' + err.message, true);
      btn.disabled = false;
    }
  });

  document.getElementById('scAddCancelBtn').addEventListener('click', () => tr.remove());
}

// ── Drag-and-drop sort ────────────────────────────────────────────────────────

function _initDragSort() {
  const tbody = document.getElementById('scTbody');

  tbody.addEventListener('dragstart', e => {
    const row = e.target.closest('tr[draggable="true"]');
    if (!row) return;
    _dragSrc = row;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => row.style.opacity = '0.4', 0);
  });

  tbody.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('tr[draggable="true"]');
    if (!row || row === _dragSrc) return;
    const rect = row.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      tbody.insertBefore(_dragSrc, row);
    } else {
      tbody.insertBefore(_dragSrc, row.nextSibling);
    }
  });

  tbody.addEventListener('dragend', async () => {
    if (_dragSrc) _dragSrc.style.opacity = '';
    _dragSrc = null;
    if (_branchId) {
      await _saveSortOrder();
      _renderTable(); // refresh order numbers after drag
    }
  });
}

async function _saveSortOrder() {
  const tbody = document.getElementById('scTbody');
  const rows  = Array.from(tbody.querySelectorAll('tr[data-id]'));
  // Re-sync _all order to match DOM
  _all = rows.map(r => _all.find(c => c.id === r.dataset.id)).filter(Boolean);

  let hadError = false;
  for (let i = 0; i < rows.length; i++) {
    try {
      await updateBranchCategoryOrder(_branchId, rows[i].dataset.id, i);
      const b = _getBinding(rows[i].dataset.id);
      if (b) b.sort_order = i;
    } catch { hadError = true; }
  }
  hadError ? _showToast('Не удалось сохранить порядок', true) : _showToast('Порядок сохранён');
}

// ── Delete modal ──────────────────────────────────────────────────────────────

let _pendingDelete = null;

function _openDeleteModal(cat) {
  _pendingDelete = cat;
  document.getElementById('delModalTitle').textContent = cat.title;
  document.getElementById('deleteModal').classList.add('open');
}
function _closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('open');
  _pendingDelete = null;
}

// ── Image modal ───────────────────────────────────────────────────────────────

function _openImageModal(cat) {
  _imgModalId = cat.id;
  document.getElementById('imageModalCatName').textContent = cat.title;
  const preview  = document.getElementById('imageModalPreview');
  const urlInput = document.getElementById('imageModalUrlInput');
  urlInput.value = cat.imageUrl || '';
  if (cat.imageUrl) { preview.src = cat.imageUrl; preview.style.display = 'block'; }
  else              { preview.style.display = 'none'; preview.src = ''; }
  document.getElementById('imageModal').classList.add('open');
}
function _closeImageModal() {
  document.getElementById('imageModal').classList.remove('open');
  _imgModalId = null;
}

function _initImageModal() {
  const modal     = document.getElementById('imageModal');
  const pickBtn   = document.getElementById('imageModalPickBtn');
  const fileInput = document.getElementById('catImgFile');
  const urlInput  = document.getElementById('imageModalUrlInput');
  const preview   = document.getElementById('imageModalPreview');
  const progress  = document.getElementById('imageModalProgress');
  const saveBtn   = document.getElementById('imageModalSaveBtn');
  const cancelBtn = document.getElementById('imageModalCancelBtn');

  pickBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!isImgBBConfigured()) { _showToast('ImgBB не настроен — вставьте URL вручную', true); return; }
    progress.style.display = 'block';
    pickBtn.disabled = true;
    try {
      const url = await uploadImage(file);
      urlInput.value = url;
      preview.src = url;
      preview.style.display = 'block';
    } catch (err) {
      _showToast('Ошибка загрузки: ' + err.message, true);
    } finally {
      progress.style.display = 'none';
      pickBtn.disabled = false;
      fileInput.value = '';
    }
  });

  urlInput.addEventListener('input', () => {
    const val = urlInput.value.trim();
    if (val) { preview.src = val; preview.style.display = 'block'; }
    else      { preview.style.display = 'none'; }
  });

  saveBtn.addEventListener('click', async () => {
    if (!_imgModalId) return;
    const imageUrl = urlInput.value.trim() || null;
    saveBtn.disabled = true;
    try {
      await updateCategory(_imgModalId, { imageUrl });
      const cat = _all.find(c => c.id === _imgModalId);
      if (cat) cat.imageUrl = imageUrl || '';
      _renderTable();
      _closeImageModal();
      _showToast('Фото обновлено');
    } catch (err) {
      _showToast('Ошибка: ' + err.message, true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', _closeImageModal);
  modal.addEventListener('click', e => { if (e.target === modal) _closeImageModal(); });
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initCategoriesStaff() {
  const session = getStaffSession();
  _branchId = session?.branch_id || null;

  const tbody = document.getElementById('scTbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#9a9488">Загрузка…</td></tr>`;

  try {
    [_all, _bindings] = await Promise.all([
      getCategories(),
      _branchId ? getBranchCategories(_branchId) : Promise.resolve([]),
    ]);
    // Filter to only show categories linked to this branch
    if (_branchId && _bindings.length) {
      const ids = new Set(_bindings.map(b => b.category_id));
      _all = _all.filter(c => ids.has(c.id));
    }
    _renderTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#c0392b">${esc(err.message)}</td></tr>`;
    return;
  }

  _initDragSort();

  document.getElementById('scAddBtn')?.addEventListener('click', _showAddRow);

  // Delegated clicks
  tbody.addEventListener('click', async e => {
    const editBtn = e.target.closest('.sc-edit-btn');
    if (editBtn) {
      _editId = editBtn.dataset.id;
      _renderTable();
      const titleEl = document.getElementById('scEditTitle');
      const slugEl  = document.getElementById('scEditSlug');
      titleEl?.addEventListener('input', () => {
        if (!slugEl.dataset.manual) slugEl.value = generateSlug(titleEl.value);
      });
      slugEl?.addEventListener('input', () => { slugEl.dataset.manual = '1'; });
      titleEl?.focus();
      return;
    }

    const saveBtn = e.target.closest('.sc-save-btn');
    if (saveBtn) {
      const id    = saveBtn.dataset.id;
      const title = document.getElementById('scEditTitle').value.trim();
      const slug  = document.getElementById('scEditSlug').value.trim() || generateSlug(title);
      if (!title) { _showToast('Введите название', true); return; }
      saveBtn.disabled = true;
      try {
        const updated = await updateCategory(id, { title, slug });
        const idx = _all.findIndex(c => c.id === id);
        if (idx !== -1 && updated) _all[idx] = updated;
        _editId = null;
        _renderTable();
        _showToast('Категория обновлена');
      } catch (err) {
        _showToast('Ошибка: ' + err.message, true);
        saveBtn.disabled = false;
      }
      return;
    }

    if (e.target.closest('.sc-cancel-btn')) { _editId = null; _renderTable(); return; }

    const delBtn = e.target.closest('.sc-delete-btn');
    if (delBtn) {
      const cat = _all.find(c => c.id === delBtn.dataset.id);
      if (cat) _openDeleteModal(cat);
      return;
    }

    const imgBtn = e.target.closest('.cat-image-btn');
    if (imgBtn) {
      const cat = _all.find(c => c.id === imgBtn.dataset.id);
      if (cat) _openImageModal(cat);
    }
  });

  // Toggle changes (popularity + active)
  tbody.addEventListener('change', async e => {
    const popularChk = e.target.closest('.sc-popular');
    const activeChk  = e.target.closest('.sc-active');
    const chk = popularChk || activeChk;
    if (!chk) return;

    const id      = chk.dataset.id;
    const checked = chk.checked;
    chk.disabled  = true;

    try {
      if (popularChk) {
        // Popularity is global — updates categories.is_popular for all branches
        await updateCategory(id, { isPopular: checked });
        const cat = _all.find(c => c.id === id);
        if (cat) cat.isPopular = checked;
        _showToast(checked ? 'Добавлена в популярные на главной' : 'Убрана с главной страницы');
      } else {
        // Active is global — updates categories.is_active for all branches
        await updateCategory(id, { isActive: checked });
        const cat = _all.find(c => c.id === id);
        if (cat) cat.isActive = checked;
        _showToast(checked ? 'Категория активирована' : 'Категория скрыта');
      }
    } catch {
      chk.checked = !checked;
      _showToast('Ошибка при обновлении', true);
    } finally {
      chk.disabled = false;
    }
  });

  // Delete modal
  document.getElementById('delConfirmBtn')?.addEventListener('click', async () => {
    if (!_pendingDelete) return;
    const cat = _pendingDelete;
    const btn = document.getElementById('delConfirmBtn');
    btn.disabled = true;
    try {
      const count = await countProductsInCategory(cat.slug);
      if (count > 0) {
        _closeDeleteModal();
        _showToast(`Нельзя удалить — привязано ${count} товаров`, true);
        return;
      }
      await deleteCategory(cat.id);
      _all = _all.filter(c => c.id !== cat.id);
      _bindings = _bindings.filter(b => b.category_id !== cat.id);
      _closeDeleteModal();
      _renderTable();
      _showToast('Категория удалена');
    } catch (err) {
      _showToast('Ошибка: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('delCancelBtn')?.addEventListener('click', _closeDeleteModal);
  document.getElementById('deleteModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('deleteModal')) _closeDeleteModal();
  });

  _initImageModal();
}
