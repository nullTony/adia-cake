// ================================
//  ADMIN — CATEGORIES LIST
// ================================

import { getSession, logout, ensureAuth }  from './auth.js';
import { initRbac, getStaffSession }      from './rbac.js';
import {
  getCategories, createCategory, updateCategory,
  deleteCategory, countProductsInCategory,
} from '../api/categories-api.js';
import { uploadImage, isImgBBConfigured } from '../api/image-upload-api.js';
import { initAdminNotifications } from '../services/notification-service.js';
import { createTableSkeletons }   from '../utils/skeleton.js';
import { esc }                    from '../utils/format.js';

initRbac('categories');
initAdminNotifications();

// ── Config ────────────────────────────────────────────────────────────────────

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

// ── State ─────────────────────────────────────────────────────────────────────

let _all          = [];
let _editId       = null;
let _imageModalId = null;

// ── Render ────────────────────────────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById('catTbody');
  const empty = document.getElementById('catEmpty');
  const count = document.getElementById('catCount');

  count.textContent = _all.length;

  if (!_all.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = _all.map(cat => {
    if (_editId === cat.id) return buildEditRow(cat);
    return buildViewRow(cat);
  }).join('');
}

function buildViewRow(cat) {
  const thumbInner = cat.imageUrl
    ? `<div class="cat-thumb"><img src="${esc(cat.imageUrl)}" alt="${esc(cat.title)}"></div>`
    : `<div class="cat-thumb cat-thumb--empty"><i class="ti ti-photo"></i><span>Нет фото</span></div>`;

  const popover = cat.imageUrl
    ? `<div class="cat-thumb-popover"><img src="${esc(cat.imageUrl)}" alt="${esc(cat.title)}"></div>`
    : '';

  return `
    <tr data-id="${esc(cat.id)}">
      <td style="font-weight:600">${esc(cat.title)}</td>
      <td><code style="font-size:12px;color:var(--a-text-light)">${esc(cat.slug)}</code></td>
      <td style="text-align:center">${esc(String(cat.sortOrder))}</td>
      <td class="cat-thumb-col">
        <div class="cat-img-cell">
          <button class="a-btn a-btn-outline cat-image-btn" data-id="${esc(cat.id)}" title="Изменить фото">
            ${thumbInner}
          </button>
          ${popover}
        </div>
      </td>
      <td>
        <label class="cl-toggle" title="${cat.isActive ? 'Активна' : 'Скрыта'}">
          <input type="checkbox" class="cat-active-chk" data-id="${esc(cat.id)}" ${cat.isActive ? 'checked' : ''}>
          <span class="cl-toggle-track"></span>
        </label>
      </td>
      <td>
        <div class="a-actions">
          <button class="a-btn a-btn-outline a-btn-sm a-btn-icon cat-edit-btn" data-id="${esc(cat.id)}" title="Редактировать">
            <i class="ti ti-pencil"></i>
          </button>
          <button class="a-btn a-btn-outline a-btn-sm a-btn-icon cat-delete-btn"
              data-id="${esc(cat.id)}" data-slug="${esc(cat.slug)}" data-title="${esc(cat.title)}"
              title="Удалить" style="color:var(--a-danger);border-color:var(--a-danger-light)">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
}

function buildEditRow(cat) {
  return `
    <tr data-id="${esc(cat.id)}" class="cat-edit-row">
      <td><input class="a-input" id="editTitle" value="${esc(cat.title)}" placeholder="Название" style="padding:6px 10px;font-size:13px"></td>
      <td><input class="a-input" id="editSlug"  value="${esc(cat.slug)}"  placeholder="slug"     style="padding:6px 10px;font-size:13px;font-family:monospace"></td>
      <td><input class="a-input" id="editSort"  value="${esc(String(cat.sortOrder))}" type="number" min="0" style="padding:6px 10px;font-size:13px;width:70px"></td>
      <td colspan="2">—</td>
      <td>
        <div class="a-actions">
          <button class="a-btn a-btn-accent a-btn-sm cat-save-btn" data-id="${esc(cat.id)}">Сохранить</button>
          <button class="a-btn a-btn-outline a-btn-sm cat-cancel-btn">Отмена</button>
        </div>
      </td>
    </tr>`;
}

// ── "Add" row ─────────────────────────────────────────────────────────────────

function showAddRow() {
  const existing = document.getElementById('catAddRow');
  if (existing) { existing.querySelector('#addTitle')?.focus(); return; }

  const tbody = document.getElementById('catTbody');
  const tr = document.createElement('tr');
  tr.id = 'catAddRow';
  tr.className = 'cat-edit-row';
  tr.innerHTML = `
    <td><input class="a-input" id="addTitle" placeholder="Название*" style="padding:6px 10px;font-size:13px"></td>
    <td><input class="a-input" id="addSlug"  placeholder="slug (авто)" style="padding:6px 10px;font-size:13px;font-family:monospace"></td>
    <td><input class="a-input" id="addSort"  placeholder="0" type="number" min="0" value="0" style="padding:6px 10px;font-size:13px;width:70px"></td>
    <td colspan="2">—</td>
    <td>
      <div class="a-actions">
        <button class="a-btn a-btn-accent a-btn-sm" id="catAddSaveBtn">Добавить</button>
        <button class="a-btn a-btn-outline a-btn-sm" id="catAddCancelBtn">Отмена</button>
      </div>
    </td>`;
  tbody.appendChild(tr);

  const titleEl = document.getElementById('addTitle');
  const slugEl  = document.getElementById('addSlug');

  titleEl.focus();
  titleEl.addEventListener('input', () => {
    if (!slugEl.dataset.manual) slugEl.value = generateSlug(titleEl.value);
  });
  slugEl.addEventListener('input', () => { slugEl.dataset.manual = '1'; });

  document.getElementById('catAddSaveBtn').addEventListener('click', async () => {
    const title = titleEl.value.trim();
    const slug  = slugEl.value.trim() || generateSlug(title);
    if (!title) { titleEl.focus(); showToast('Введите название категории', true); return; }
    const btn = document.getElementById('catAddSaveBtn');
    btn.disabled = true;
    try {
      const cat = await createCategory({ title, slug, sortOrder: parseInt(document.getElementById('addSort').value) || 0 });
      if (cat) _all.push(cat);
      tr.remove();
      renderTable();
      showToast('Категория добавлена');
    } catch (err) {
      showToast('Ошибка: ' + err.message, true);
      btn.disabled = false;
    }
  });

  document.getElementById('catAddCancelBtn').addEventListener('click', () => tr.remove());
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

let _pendingDelete = null;

function openDeleteConfirm(cat) {
  _pendingDelete = cat;
  document.getElementById('delModalTitle').textContent = cat.title;
  document.getElementById('deleteModal').classList.add('open');
}
function closeDeleteConfirm() {
  document.getElementById('deleteModal').classList.remove('open');
  _pendingDelete = null;
}

// ── Image modal ───────────────────────────────────────────────────────────────

function openImageModal(cat) {
  _imageModalId = cat.id;
  document.getElementById('imageModalCatName').textContent = cat.title;

  const preview  = document.getElementById('imageModalPreview');
  const urlInput = document.getElementById('imageModalUrlInput');
  urlInput.value = cat.imageUrl || '';
  if (cat.imageUrl) {
    preview.src = cat.imageUrl;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
    preview.src = '';
  }
  document.getElementById('imageModal').classList.add('open');
}

function closeImageModal() {
  document.getElementById('imageModal').classList.remove('open');
  _imageModalId = null;
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
    if (!isImgBBConfigured()) {
      showToast('ImgBB не настроен — вставьте URL вручную', true);
      return;
    }
    progress.style.display = 'block';
    pickBtn.disabled = true;
    try {
      const url = await uploadImage(file);
      urlInput.value = url;
      preview.src = url;
      preview.style.display = 'block';
    } catch (err) {
      showToast('Ошибка загрузки: ' + err.message, true);
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
    if (!_imageModalId) return;
    const imageUrl = urlInput.value.trim() || null;
    saveBtn.disabled = true;
    try {
      await updateCategory(_imageModalId, { imageUrl });
      const cat = _all.find(c => c.id === _imageModalId);
      if (cat) cat.imageUrl = imageUrl || '';
      renderTable();
      closeImageModal();
      showToast('Фото обновлено');
    } catch (err) {
      showToast('Ошибка: ' + err.message, true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', closeImageModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeImageModal(); });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  if (!await ensureAuth()) return;
  // Only run for admin/manager — staff uses categories-staff.js
  const staffSession = getStaffSession();
  if (!['super_admin', 'admin', 'manager'].includes(staffSession?.role)) return;

  const session = getSession();
  document.getElementById('adminUser').textContent = session?.full_name || session?.role || 'admin';
  document.getElementById('logoutBtn').addEventListener('click', logout);

  const tbody = document.getElementById('catTbody');
  tbody.innerHTML = createTableSkeletons(5, 6);

  try {
    _all = await getCategories();
    renderTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#c0392b">${esc(err.message)}</td></tr>`;
    return;
  }

  document.getElementById('addCatBtn').addEventListener('click', showAddRow);

  tbody.addEventListener('click', async e => {
    const editBtn = e.target.closest('.cat-edit-btn');
    if (editBtn) {
      _editId = editBtn.dataset.id;
      renderTable();
      const titleEl = document.getElementById('editTitle');
      const slugEl  = document.getElementById('editSlug');
      titleEl?.addEventListener('input', () => {
        if (!slugEl.dataset.manual) slugEl.value = generateSlug(titleEl.value);
      });
      slugEl?.addEventListener('input', () => { slugEl.dataset.manual = '1'; });
      titleEl?.focus();
      return;
    }

    const saveBtn = e.target.closest('.cat-save-btn');
    if (saveBtn) {
      const id    = saveBtn.dataset.id;
      const title = document.getElementById('editTitle').value.trim();
      const slug  = document.getElementById('editSlug').value.trim() || generateSlug(title);
      const sort  = parseInt(document.getElementById('editSort').value) || 0;
      if (!title) { showToast('Введите название', true); return; }
      saveBtn.disabled = true;
      try {
        const updated = await updateCategory(id, { title, slug, sortOrder: sort });
        const idx = _all.findIndex(c => c.id === id);
        if (idx !== -1 && updated) _all[idx] = updated;
        _editId = null;
        renderTable();
        showToast('Категория обновлена');
      } catch (err) {
        showToast('Ошибка: ' + err.message, true);
        saveBtn.disabled = false;
      }
      return;
    }

    if (e.target.closest('.cat-cancel-btn')) {
      _editId = null;
      renderTable();
      return;
    }

    const delBtn = e.target.closest('.cat-delete-btn');
    if (delBtn) {
      const cat = _all.find(c => c.id === delBtn.dataset.id);
      if (cat) openDeleteConfirm(cat);
      return;
    }
  });

  tbody.addEventListener('change', async e => {
    const chk = e.target.closest('.cat-active-chk');
    if (!chk) return;
    const id      = chk.dataset.id;
    const checked = chk.checked;
    chk.disabled  = true;
    try {
      await updateCategory(id, { isActive: checked });
      const cat = _all.find(c => c.id === id);
      if (cat) cat.isActive = checked;
      showToast(checked ? 'Категория активирована' : 'Категория скрыта');
    } catch {
      chk.checked = !checked;
    } finally {
      chk.disabled = false;
    }
  });

  tbody.addEventListener('click', async e => {
    const imgBtn = e.target.closest('.cat-image-btn');
    if (!imgBtn) return;
    const cat = _all.find(c => c.id === imgBtn.dataset.id);
    if (cat) openImageModal(cat);
  });

  document.getElementById('delConfirmBtn').addEventListener('click', async () => {
    if (!_pendingDelete) return;
    const cat = _pendingDelete;
    const btn = document.getElementById('delConfirmBtn');
    btn.disabled = true;
    try {
      const count = await countProductsInCategory(cat.slug);
      if (count > 0) {
        closeDeleteConfirm();
        showToast(`Нельзя удалить — привязано ${count} товаров`, true);
        return;
      }
      await deleteCategory(cat.id);
      _all = _all.filter(c => c.id !== cat.id);
      closeDeleteConfirm();
      renderTable();
      showToast('Категория удалена');
    } catch (err) {
      showToast('Ошибка: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('delCancelBtn').addEventListener('click', closeDeleteConfirm);
  document.getElementById('deleteModal').addEventListener('click', e => {
    if (e.target === document.getElementById('deleteModal')) closeDeleteConfirm();
  });

  _initImageModal();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'a-toast show' + (isError ? ' a-toast--error' : '');
  setTimeout(() => t.classList.remove('show'), 3000);
}

init();
