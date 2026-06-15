// ================================
//  ADMIN — PRODUCT ADD / EDIT FORM
// ================================

import { logout, getSession }                            from './auth.js';
import { initRbac }                                     from './rbac.js';
import { getProductById, createProduct, updateProduct }  from '../api/products-api.js';
import { uploadImage, isImgBBConfigured }                from '../api/image-upload-api.js';
import { getCategories }                                 from '../api/categories-api.js';
import { calculateWeightPrice, formatWeight, generateWeightOptions } from '../utils/weight.js';

initRbac('products');

// ---- Mode ----

const params = new URLSearchParams(window.location.search);
const editId = params.get('id');
const isEdit = !!editId;

document.getElementById('formPageTitle').textContent = isEdit ? 'Редактировать товар' : 'Новый товар';
document.getElementById('formTitle').textContent     = isEdit ? 'Редактировать товар' : 'Добавить товар';
document.getElementById('logoutBtn')?.addEventListener('click', logout);

const session = getSession();
const userEl  = document.getElementById('adminUser');
if (userEl && session) userEl.textContent = session.full_name || session.role;

// ---- Field refs ----

const form            = document.getElementById('productForm');
const titleEl         = document.getElementById('fTitle');
const descEl          = document.getElementById('fDesc');
const priceEl         = document.getElementById('fPrice');
const categoryEl      = document.getElementById('fCategory');
const photoUrlEl      = document.getElementById('fPhotoUrl');
const fileInputEl     = document.getElementById('fPhotoFile');
const uploadBtn       = document.getElementById('uploadPhotoBtn');
const uploadStatus    = document.getElementById('uploadStatus');
const imgPreview      = document.getElementById('imgPreview');
const imgPlaceholder  = document.getElementById('imgPlaceholder');
const isActiveEl      = document.getElementById('fIsActive');
const sortOrderEl     = document.getElementById('fSortOrder');
const saveBtn         = document.getElementById('saveBtn');
const errorBanner     = document.getElementById('formError');

// Weight fields
const weightFieldsEl  = document.getElementById('weightFields');
const weightPreviewEl = document.getElementById('weightPreview');
const previewBtnsEl   = document.getElementById('weightPreviewBtns');
const previewPriceEl  = document.getElementById('weightPreviewPrice');
const fWeightMin      = document.getElementById('fWeightMin');
const fWeightMax      = document.getElementById('fWeightMax');
const fWeightStep     = document.getElementById('fWeightStep');

function _isWeightMode() {
  return document.querySelector('input[name="fUnitType"]:checked')?.value === 'weight';
}

// Apply unit-type UI state (called by both the change listener and loadProduct)
function _applyUnitType(isWeight) {
  if (weightFieldsEl) weightFieldsEl.hidden = !isWeight;
  const priceLabel = document.querySelector('label[for="fPrice"]');
  if (priceLabel) priceLabel.childNodes[0].textContent = isWeight ? 'Цена за 1 кг, сум ' : 'Цена, сум ';
  if (isWeight) _updateWeightPreview();
}

function _updateWeightPreview() {
  if (!weightPreviewEl) return;
  const min    = parseInt(fWeightMin?.value, 10)  || 0;
  const max    = parseInt(fWeightMax?.value, 10)  || 0;
  const step   = parseInt(fWeightStep?.value, 10) || 0;
  const pricePerKg = parseInt(priceEl?.value, 10) || 0;

  if (!min || !max || !step || min >= max || step > (max - min)) {
    weightPreviewEl.style.display = 'none';
    return;
  }

  const options = generateWeightOptions(min, max, step);
  if (!options.length) { weightPreviewEl.style.display = 'none'; return; }

  weightPreviewEl.style.display = '';
  previewBtnsEl.innerHTML = options.map(g =>
    `<span style="display:inline-block;padding:4px 12px;border-radius:20px;border:1.5px solid var(--a-border);font-size:12px;font-weight:700;background:#fff">${formatWeight(g)}</span>`
  ).join('');

  if (pricePerKg) {
    const exPrice = calculateWeightPrice(pricePerKg, options[0]);
    const per100  = Math.round(pricePerKg / 10);
    previewPriceEl.textContent =
      `Пример: ${formatWeight(options[0])} = ${String(exPrice).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} сум · ` +
      `от ${String(per100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} сум / 100 г`;
  } else {
    previewPriceEl.textContent = 'Укажите цену за 1 кг выше';
  }
}

// Live character counter for title
const titleCountEl = document.getElementById('titleCharCount');
titleEl?.addEventListener('input', () => {
  const len = titleEl.value.length;
  if (titleCountEl) {
    titleCountEl.textContent = `${len}/25`;
    titleCountEl.style.color = len > 25 ? 'var(--a-danger)' : 'var(--a-text-light)';
  }
});

// Wire unit type toggle
document.querySelectorAll('input[name="fUnitType"]').forEach(r => {
  r.addEventListener('change', () => _applyUnitType(_isWeightMode()));
});

// Wire weight field inputs for live preview
[fWeightMin, fWeightMax, fWeightStep, priceEl].forEach(el => {
  el?.addEventListener('input', () => { if (_isWeightMode()) _updateWeightPreview(); });
});

// ---- ImgBB status ----

if (isImgBBConfigured()) {
  uploadBtn?.removeAttribute('disabled');
  if (uploadStatus) uploadStatus.textContent = 'ImgBB подключён';
} else {
  if (uploadStatus) uploadStatus.textContent = 'ImgBB не настроен — вставьте URL вручную или задайте IMGBB.API_KEY в api-config.js';
  uploadBtn?.setAttribute('disabled', '');
}

// ---- Load categories into select ----

async function loadCategories(selectedSlug = '') {
  try {
    const cats = await getCategories(true);
    categoryEl.innerHTML = '<option value="">— Выберите категорию —</option>';
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value       = cat.slug;
      opt.textContent = cat.title;
      if (cat.slug === selectedSlug) opt.selected = true;
      categoryEl.appendChild(opt);
    });
    if (!cats.length) {
      categoryEl.innerHTML = '<option value="">Нет активных категорий</option>';
    }
  } catch {
    categoryEl.innerHTML = '<option value="">Ошибка загрузки категорий</option>';
  }
}

// ---- Load existing product (edit mode) ----

async function loadProduct() {
  if (!isEdit) return;
  try {
    const p = await getProductById(editId);
    if (!p) { showError('Товар не найден'); return; }
    document.getElementById('formTitle').textContent = `Редактировать: ${p.title || ''}`;
    titleEl.value      = p.title       || '';
    if (titleCountEl) {
      const len = titleEl.value.length;
      titleCountEl.textContent = `${len}/25`;
      titleCountEl.style.color = len > 25 ? 'var(--a-danger)' : 'var(--a-text-light)';
    }
    descEl.value       = p.description || '';
    priceEl.value      = p.price       != null ? p.price : '';
    photoUrlEl.value   = p.photo       || '';
    sortOrderEl.value  = p.sortOrder   != null ? p.sortOrder : 0;
    if (isActiveEl) isActiveEl.checked = p.inStock !== false;
    // Unit type — set radio, fill weight fields, update label + preview
    const isWeight = p.unitType === 'weight';
    const unitRadio = document.querySelector(`input[name="fUnitType"][value="${isWeight ? 'weight' : 'piece'}"]`);
    if (unitRadio) unitRadio.checked = true;
    // Always load weight values so they're ready if user switches unit type
    if (fWeightMin)  fWeightMin.value  = p.minWeight  ?? '';
    if (fWeightMax)  fWeightMax.value  = p.maxWeight  ?? '';
    if (fWeightStep) fWeightStep.value = p.weightStep ?? '';
    _applyUnitType(isWeight); // syncs label, visibility, and preview
    await loadCategories(p.category || '');
    updateImgPreview(p.photo);
  } catch (err) {
    showError('Ошибка загрузки товара: ' + err.message);
  }
}

// ---- Image preview ----

photoUrlEl?.addEventListener('input', () => updateImgPreview(photoUrlEl.value.trim()));

function updateImgPreview(url) {
  if (!url) {
    imgPreview.style.display     = 'none';
    imgPlaceholder.style.display = '';
    return;
  }
  imgPreview.src               = url;
  imgPreview.style.display     = '';
  imgPlaceholder.style.display = 'none';
  imgPreview.onerror = () => {
    imgPreview.style.display     = 'none';
    imgPlaceholder.style.display = '';
  };
}

// ---- ImgBB file upload ----

uploadBtn?.addEventListener('click', () => fileInputEl?.click());

fileInputEl?.addEventListener('change', async () => {
  const file = fileInputEl.files?.[0];
  if (!file) return;

  uploadBtn.disabled = true;
  if (uploadStatus) uploadStatus.textContent = 'Загрузка...';

  try {
    const url = await uploadImage(file);
    photoUrlEl.value = url;
    updateImgPreview(url);
    if (uploadStatus) uploadStatus.textContent = 'Фото загружено!';
  } catch (err) {
    if (uploadStatus) uploadStatus.textContent = 'Ошибка загрузки: ' + err.message;
  } finally {
    uploadBtn.disabled = false;
    fileInputEl.value  = '';
  }
});

// ---- Validation ----

function validate() {
  let ok = true;
  [titleEl, priceEl, categoryEl].forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.a-input-error').forEach(e => e.classList.remove('visible'));

  const titleVal = titleEl.value.trim();
  const errTitle = document.getElementById('errTitle');
  if (!titleVal) {
    titleEl.classList.add('error');
    errTitle.textContent = 'Укажите название товара';
    errTitle.classList.add('visible');
    ok = false;
  } else if (titleVal.length > 25) {
    titleEl.classList.add('error');
    errTitle.textContent = `Название слишком длинное (${titleVal.length}/25 символов)`;
    errTitle.classList.add('visible');
    ok = false;
  }
  if (!priceEl.value || isNaN(Number(priceEl.value)) || Number(priceEl.value) <= 0) {
    priceEl.classList.add('error');
    document.getElementById('errPrice').classList.add('visible');
    ok = false;
  }
  if (!categoryEl.value) {
    categoryEl.classList.add('error');
    document.getElementById('errCategory')?.classList.add('visible');
    ok = false;
  }

  if (_isWeightMode()) {
    const min  = parseInt(fWeightMin?.value,  10) || 0;
    const max  = parseInt(fWeightMax?.value,  10) || 0;
    const step = parseInt(fWeightStep?.value, 10) || 0;
    const weightOk = min > 0 && max > 0 && step > 0 && min < max && step <= (max - min);
    if (!weightOk) {
      document.getElementById('errWeight')?.classList.add('visible');
      ok = false;
    }
  }

  return ok;
}

// ---- Submit ----

form?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validate()) return;

  saveBtn.disabled    = true;
  saveBtn.textContent = 'Сохранение...';
  errorBanner.style.display = 'none';

  const now      = new Date().toISOString();
  const isWeight = _isWeightMode();
  const data = {
    title:           titleEl.value.trim(),
    description:     descEl.value.trim(),
    price:           parseInt(priceEl.value, 10),
    category:        categoryEl.value,
    photo:           photoUrlEl.value.trim(),
    inStock:         isActiveEl ? isActiveEl.checked : true,
    sortOrder:       parseInt(sortOrderEl.value, 10) || 0,
    unitType:        isWeight ? 'weight' : 'piece',
    weightStep:      isWeight ? (parseInt(fWeightStep?.value, 10) || null) : null,
    minWeight:       isWeight ? (parseInt(fWeightMin?.value,  10) || null) : null,
    maxWeight:       isWeight ? (parseInt(fWeightMax?.value,  10) || null) : null,
    updatedAt:       now,
  };

  try {
    if (isEdit) {
      await updateProduct(editId, data);
    } else {
      data.createdAt = now;
      await createProduct(data);
    }
    window.location.href = 'products.html?saved=1';
  } catch (err) {
    showError('Ошибка сохранения: ' + err.message);
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Сохранить';
  }
});

// ---- Cancel ----

document.getElementById('cancelBtn')?.addEventListener('click', () => {
  window.location.href = 'products.html';
});

// ---- Helpers ----

function showError(msg) {
  errorBanner.textContent   = msg;
  errorBanner.style.display = 'block';
}

// ---- Init ----

if (isEdit) {
  loadProduct();
} else {
  loadCategories();
}
