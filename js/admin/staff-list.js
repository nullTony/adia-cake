// ================================
//  ADMIN — STAFF LIST
// ================================

import { getSession, ensureAuth }                            from './auth.js';
import { initRbac, ROLE_PERMISSIONS,
         EXTRA_GRANTABLE, PERM_LABEL }                      from './rbac.js';
import { getAllStaff, createStaff,
         updateStaff, updateStaffActive, checkStaffPhone,
         updateStaffTelegramChatId, copyChatIdFromClient }   from '../api/staff-api.js';
import { getAllClients }                                      from '../api/clients-api.js';
import { getActiveSession }                                  from '../api/supabase-auth.js';
import { API_CONFIG }                                        from '../config/api-config.js';
import { getBranches }                                       from '../api/branches-api.js';
import { sbFetch }                                           from '../api/supabase-client.js';
import { initAdminNotifications }                            from '../services/notification-service.js';
import { initPhoneInput, handlePhoneInput, getPhoneValue }   from '../utils/phone-input.js';
import { createTableSkeletons }                              from '../utils/skeleton.js';
import { esc, formatDateOnly }                              from '../utils/format.js';

initRbac('staff');
initAdminNotifications();

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABEL = {
  super_admin: 'Управляющий',
  admin:       'Администратор',
  manager:     'Менеджер',
  operator:    'Оператор',
};

const ROLE_RANK = ['operator', 'manager', 'admin', 'super_admin'];

function _assignableRoles(myRole) {
  const idx = ROLE_RANK.indexOf(myRole);
  if (idx < 1) return [];
  return ROLE_RANK.slice(0, idx + 1);
}

function _needsBranch(role) {
  return role === 'manager' || role === 'operator';
}

// ── State ─────────────────────────────────────────────────────────────────────

let _all               = [];
let _filtered          = [];
let _branches          = [];
let _myRole            = 'manager';
let _myId              = null;
let _editingId         = null;
let _tgLinked          = new Set();
let _clientSearchTimer = null;
let _selectedClient    = null;  // { id, name, phone } picked from client search

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name) {
  return (name || '?').trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

// ── Telegram status ───────────────────────────────────────────────────────────

async function _loadTelegramStatus(phones) {
  if (!phones.length) return new Set();
  try {
    const rows = await sbFetch(
      `/clients?select=phone&phone=in.(${phones.join(',')})&telegram_chat_id=not.is.null`
    );
    return new Set(Array.isArray(rows) ? rows.map(r => r.phone) : []);
  } catch {
    return new Set();
  }
}

// ── Branch cell html ──────────────────────────────────────────────────────────

function _renderBranchCell(s) {
  if (!_needsBranch(s.role)) {
    return '<span style="color:var(--a-text-light)">—</span>';
  }
  if (s.branchId) {
    const name = s.branchName || _branches.find(b => b.id === s.branchId)?.name || s.branchId;
    return `<span class="sl-branch-badge">${esc(name)}</span>`;
  }
  const opts = _branches.map(b =>
    `<option value="${esc(b.id)}">${esc(b.name)}</option>`
  ).join('');
  return `
    <span class="sl-branch-warn">⚠ Не назначен</span>
    <select class="sl-branch-select" data-id="${esc(s.id)}" style="margin-left:8px">
      <option value="">Выбрать…</option>
      ${opts}
    </select>`;
}

// ── Render table ──────────────────────────────────────────────────────────────

function renderTable(staff) {
  const tbody = document.getElementById('staffTbody');
  const empty = document.getElementById('staffEmpty');
  const count = document.getElementById('staffCount');

  count.textContent = staff.length;

  if (!staff.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const assignable = _assignableRoles(_myRole);
  const canEdit    = assignable.length > 0;

  tbody.innerHTML = staff.map(s => {
    const isSelf = s.id === _myId;

    const roleOpts = ROLE_RANK.map(r => `
      <option value="${r}" ${s.role === r ? 'selected' : ''} ${!assignable.includes(r) ? 'disabled' : ''}>
        ${esc(ROLE_LABEL[r] || r)}
      </option>`).join('');

    const tgBound = !!s.telegramId || _tgLinked.has(s.phone);
    const tgCell = tgBound
      ? `<span class="cl-tg-badge cl-tg-yes">✅ Привязан</span>`
      : `<span class="cl-tg-badge cl-tg-no">Не привязан</span>`;

    const editBtn = canEdit
      ? `<button class="sl-edit-btn" data-id="${esc(s.id)}" title="Редактировать">
           <i class="ti ti-pencil"></i>
         </button>`
      : '';

    return `
      <tr data-id="${esc(s.id)}" class="${s.isActive ? '' : 'sl-inactive'}">
        <td>
          <div class="cl-user">
            <div class="cl-avatar cl-avatar--staff">${esc(initials(s.name))}</div>
            <div class="cl-user-info">
              <div class="cl-user-name">${esc(s.name || '—')}</div>
              <div class="cl-user-phone">${esc(s.phone)}</div>
            </div>
          </div>
        </td>
        <td>
          <select class="sl-role-select" data-id="${esc(s.id)}" data-current="${esc(s.role)}"
                  ${isSelf ? 'disabled title="Нельзя изменить собственную роль"' : ''}>
            ${roleOpts}
          </select>
        </td>
        <td class="sl-branch-cell" data-id="${esc(s.id)}">${_renderBranchCell(s)}</td>
        <td>${tgCell}</td>
        <td>${formatDateOnly(s.createdAt)}</td>
        <td>
          <label class="cl-toggle" title="${s.isActive ? 'Активен' : 'Деактивирован'}">
            <input type="checkbox" class="sl-active-chk" data-id="${esc(s.id)}"
                   ${s.isActive ? 'checked' : ''} ${isSelf ? 'disabled' : ''}>
            <span class="cl-toggle-track"></span>
          </label>
        </td>
        <td>${editBtn}</td>
      </tr>`;
  }).join('');
}

// ── Filter ────────────────────────────────────────────────────────────────────

function applyFilter(query) {
  const q = (query || '').toLowerCase().trim();
  _filtered = q
    ? _all.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q) ||
        (s.role || '').includes(q) ||
        (s.branchName || '').toLowerCase().includes(q))
    : [..._all];
  renderTable(_filtered);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal(staff = null) {
  _editingId = staff ? staff.id : null;

  const nameEl          = document.getElementById('smName');
  const phoneEl         = document.getElementById('smPhone');
  const pwdEl           = document.getElementById('smPassword');
  const pwdLabel        = document.getElementById('smPasswordLabel');
  const roleEl          = document.getElementById('smRole');
  const branchEl        = document.getElementById('smBranch');
  const clientSearch    = document.getElementById('smClientSearch');
  const emailField      = document.getElementById('smEmailField');
  const emailEl         = document.getElementById('smEmail');
  const clientSelected  = document.getElementById('smClientSelected');
  const clientQ         = document.getElementById('smClientQ');
  const clientResults   = document.getElementById('smClientResults');

  branchEl.innerHTML = '<option value="">Выберите филиал</option>' +
    _branches.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');

  const assignable = _assignableRoles(_myRole);
  Array.from(roleEl.options).forEach(opt => {
    opt.disabled = !assignable.includes(opt.value);
  });

  initPhoneInput(phoneEl, staff?.phone || null);
  handlePhoneInput(phoneEl);

  if (staff) {
    // ── Edit mode ──────────────────────────────────────────────────────────────
    document.getElementById('smTitle').textContent = 'Редактировать сотрудника';
    document.getElementById('smSub').textContent   = staff.name || '';
    nameEl.value         = staff.name || '';
    initPhoneInput(phoneEl, staff.phone || null);
    pwdEl.value          = '';
    pwdEl.placeholder    = 'Оставьте пустым чтобы не менять';
    pwdLabel.textContent = 'Пароль';
    roleEl.value         = staff.role || 'operator';
    branchEl.value       = staff.branchId || '';
    // Hide Add-mode-only fields
    clientSearch.hidden = true;
    emailField.hidden   = true;
    _updateBranchField();
    _updateExtraPermsField(staff.extraPermissions || []);
  } else {
    // ── Add mode ───────────────────────────────────────────────────────────────
    document.getElementById('smTitle').textContent = 'Добавить сотрудника';
    document.getElementById('smSub').textContent   = 'Заполните данные нового сотрудника';
    nameEl.value         = '';
    initPhoneInput(phoneEl, null);
    pwdEl.value          = '';
    pwdEl.placeholder    = 'Минимум 4 символа. Оставьте пустым — пароль не изменится';
    pwdLabel.textContent = 'Пароль';
    roleEl.value         = assignable.includes('super_admin') ? 'super_admin'
                         : assignable.includes('admin')       ? 'admin'
                         : assignable[0] || 'operator';
    branchEl.value       = '';
    // Show Add-mode-only fields and reset their state
    clientSearch.hidden    = false;
    emailField.hidden      = false;
    _selectedClient        = null;
    clientQ.value          = '';
    emailEl.value          = '';
    clientResults.hidden   = true;
    clientResults.innerHTML = '';
    clientSelected.hidden  = true;
    clientSelected.innerHTML = '';
    // Auto-suggest email from phone when typed manually (no client selected)
    phoneEl.addEventListener('input', () => {
      if (_selectedClient) return;
      const digits = getPhoneValue(phoneEl).replace(/\D/g, '');
      if (digits.length >= 7) emailEl.value = `${digits}@adia.app`;
    });
    _updateBranchField();
    _updateExtraPermsField([]);
  }

  _clearModalErrors();
  document.getElementById('staffModal').classList.add('open');
  nameEl.focus();
}

function closeModal() {
  document.getElementById('staffModal').classList.remove('open');
  _editingId = null;
}

function _updateBranchField() {
  const role  = document.getElementById('smRole').value;
  const show  = _needsBranch(role);
  document.getElementById('smBranchField').hidden = !show;
  document.getElementById('smBranch').required    = show;
  if (!show) document.getElementById('smBranch').value = '';
  _updateExtraPermsField();
}

// Render extra-permission checkboxes for the selected role.
// Only visible when current user is super_admin editing a non-super_admin.
function _updateExtraPermsField(currentExtra = null) {
  const extraField = document.getElementById('smExtraField');
  const extraList  = document.getElementById('smExtraList');
  if (!extraField || !extraList) return;

  if (_myRole !== 'super_admin') {
    extraField.hidden = true;
    return;
  }

  const role      = document.getElementById('smRole').value;
  const basePerms = ROLE_PERMISSIONS[role] || [];
  // Permissions the role doesn't already have that can be granted
  const grantable = EXTRA_GRANTABLE.filter(p => !basePerms.includes(p));

  if (!grantable.length || role === 'super_admin') {
    extraField.hidden = true;
    return;
  }

  extraField.hidden = false;

  // Preserve currently checked state if not given an initial set
  const checked = currentExtra !== null
    ? new Set(currentExtra)
    : new Set(
        Array.from(extraList.querySelectorAll('input[type="checkbox"]:checked'))
             .map(el => el.value)
      );

  extraList.innerHTML = grantable.map(p => `
    <label class="sm-extra-item">
      <input type="checkbox" name="extraPerm" value="${p}" ${checked.has(p) ? 'checked' : ''}>
      ${esc(PERM_LABEL[p] || p)}
    </label>
  `).join('');
}

function _clearModalErrors() {
  document.querySelectorAll('#staffModal .sm-error').forEach(el => {
    el.classList.remove('visible');
  });
  document.querySelectorAll('#staffModal .sm-input, #staffModal .sm-select').forEach(el => {
    el.classList.remove('error');
  });
  const fe = document.getElementById('smFormErr');
  if (fe) fe.textContent = '';
}

function _fieldError(inputId, errId) {
  document.getElementById(inputId)?.classList.add('error');
  document.getElementById(errId)?.classList.add('visible');
}

async function _handleSave() {
  _clearModalErrors();

  const name     = document.getElementById('smName').value.trim();
  const phone    = getPhoneValue(document.getElementById('smPhone'));
  const pwd      = document.getElementById('smPassword').value;
  const role     = document.getElementById('smRole').value;
  const branchId = document.getElementById('smBranch').value || null;
  const formErr  = document.getElementById('smFormErr');

  const extraPermissions = Array.from(
    document.querySelectorAll('#smExtraList input[type="checkbox"]:checked')
  ).map(el => el.value);

  let valid = true;
  if (!name)                             { _fieldError('smName', 'smNameErr');         valid = false; }
  if (!phone)                            { _fieldError('smPhone', 'smPhoneErr');        valid = false; }
  if (pwd.trim() && pwd.trim().length < 4) { _fieldError('smPassword', 'smPasswordErr'); valid = false; }
  if (_needsBranch(role) && !branchId)  { _fieldError('smBranch', 'smBranchErr');     valid = false; }
  if (!valid) return;

  const saveBtn = document.getElementById('smSaveBtn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Сохранение…';

  try {
    if (_editingId) {
      // ── Edit existing staff — unchanged ─────────────────────────────────────
      await updateStaff(_editingId, {
        name,
        phone,
        password:         pwd.trim() || undefined,
        role,
        branchId:         _needsBranch(role) ? branchId : null,
        extraPermissions,
      });
      closeModal();
      await _reload();
      showToast('Сотрудник обновлён');

    } else {
      // ── Add new staff via Edge Function (requires super_admin JWT) ───────────
      const email = document.getElementById('smEmail').value.trim();
      if (!email) { _fieldError('smEmail', 'smEmailErr'); return; }

      const jwt = await getActiveSession();
      if (!jwt) throw new Error('Сессия истекла. Перезайдите.');

      const res = await fetch(
        `${API_CONFIG.SUPABASE.URL}/functions/v1/create-staff`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${jwt}`,
            'apikey':        API_CONFIG.SUPABASE.ANON_KEY,
          },
          body: JSON.stringify({
            full_name: name,
            phone,
            role,
            branch_id: _needsBranch(role) ? branchId : null,
            email,
            password:  pwd.trim(),
          }),
        }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Ошибка создания сотрудника');

      // Auto-copy Telegram chat_id from clients table if phone matches
      let tgCopied = false;
      if (json.staff?.id) {
        try {
          const chatId = await copyChatIdFromClient(phone);
          if (chatId) { await updateStaffTelegramChatId(json.staff.id, chatId); tgCopied = true; }
        } catch { /* non-critical */ }
      }

      closeModal();
      await _reload();
      const baseMsg = `${name} добавлен как ${ROLE_LABEL[role] || role}`;
      showToast(tgCopied ? `${baseMsg} · Telegram привязан ✅` : baseMsg);
    }

  } catch (err) {
    formErr.textContent = err.message || 'Ошибка сохранения';
    formErr.classList.add('visible');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Сохранить';
  }
}

// ── Client search (Add mode only) ─────────────────────────────────────────────

function _bindClientSearch() {
  const q        = document.getElementById('smClientQ');
  const results  = document.getElementById('smClientResults');
  const selected = document.getElementById('smClientSelected');

  q.addEventListener('input', () => {
    clearTimeout(_clientSearchTimer);
    const val = q.value.trim();
    if (val.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
    _clientSearchTimer = setTimeout(async () => {
      try {
        const clients = await getAllClients(val);
        if (!clients.length) {
          results.innerHTML = '<div class="sm-cr-empty">Не найдено</div>';
          results.hidden = false;
          return;
        }
        results.innerHTML = clients.slice(0, 8).map(c => `
          <div class="sm-cr-item" data-id="${esc(c.id)}" data-name="${esc(c.name)}" data-phone="${esc(c.phone)}">
            <span class="sm-cr-name">${esc(c.name)}</span>
            <span class="sm-cr-phone">${esc(c.phone)}</span>
          </div>`).join('');
        results.hidden = false;
      } catch { results.hidden = true; }
    }, 300);
  });

  results.addEventListener('click', e => {
    const item = e.target.closest('.sm-cr-item');
    if (!item) return;
    _selectedClient = { id: item.dataset.id, name: item.dataset.name, phone: item.dataset.phone };
    // Fill name + phone fields from the selected client
    document.getElementById('smName').value = _selectedClient.name;
    initPhoneInput(document.getElementById('smPhone'), _selectedClient.phone);
    // Auto-suggest email: digits only + @adia.app
    const digits = _selectedClient.phone.replace(/\D/g, '');
    document.getElementById('smEmail').value = `${digits}@adia.app`;
    // Show selected pill, hide dropdown and search input
    selected.innerHTML = `
      <div class="sm-client-pill">
        <span>${esc(_selectedClient.name)} · ${esc(_selectedClient.phone)}</span>
        <button type="button" id="smClearClient" class="sm-cr-clear">&#x2715;</button>
      </div>`;
    selected.hidden = false;
    results.hidden  = true;
    q.value = '';
    document.getElementById('smClearClient').addEventListener('click', () => {
      _selectedClient = null;
      selected.hidden = true;
      document.getElementById('smName').value = '';
      initPhoneInput(document.getElementById('smPhone'), null);
      document.getElementById('smEmail').value = '';
    });
  });
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function _reload() {
  _all         = await getAllStaff('');
  const phones = _all.map(s => s.phone).filter(Boolean);
  _tgLinked    = await _loadTelegramStatus(phones);
  _filtered    = [..._all];
  renderTable(_filtered);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  if (!await ensureAuth()) return;
  const session = getSession();
  _myRole = session?.role || 'manager';
  _myId   = session?.id || null;
  document.getElementById('adminUser').textContent = session?.full_name || _myRole;

  document.getElementById('logoutBtn').addEventListener('click', () => {
    import('./auth.js').then(m => m.logout());
  });

  // Preload branches (needed before modal opens)
  try { _branches = await getBranches(); } catch { _branches = []; }

  const tbody = document.getElementById('staffTbody');
  tbody.innerHTML = createTableSkeletons(5, 7);

  try {
    await _reload();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#c0392b">${esc(err.message)}</td></tr>`;
    return;
  }

  // Search
  document.getElementById('searchInput').addEventListener('input', e => applyFilter(e.target.value));

  // Table events (delegated)
  document.getElementById('staffTbody').addEventListener('change', async e => {

    // Role select
    const roleSel = e.target.closest('.sl-role-select');
    if (roleSel) {
      const id   = roleSel.dataset.id;
      const role = roleSel.value;
      const prev = roleSel.dataset.current;
      roleSel.disabled = true;
      try {
        const clearBranch = !_needsBranch(role);
        await updateStaff(id, { role, ...( clearBranch ? { branchId: null } : {}) });
        roleSel.dataset.current = role;
        const s = _all.find(x => x.id === id);
        if (s) {
          s.role = role;
          if (clearBranch) { s.branchId = null; s.branchName = null; }
        }
        const branchCell = document.querySelector(`.sl-branch-cell[data-id="${CSS.escape(id)}"]`);
        if (branchCell && s) branchCell.innerHTML = _renderBranchCell(s);
        showToast('Роль обновлена');
      } catch {
        roleSel.value = prev;
        showToast('Ошибка обновления роли', true);
      } finally {
        roleSel.disabled = false;
      }
      return;
    }

    // Inline branch select
    const branchSel = e.target.closest('.sl-branch-select');
    if (branchSel) {
      const id       = branchSel.dataset.id;
      const branchId = branchSel.value || null;
      if (!branchId) return;
      try {
        await updateStaff(id, { branchId });
        const s      = _all.find(x => x.id === id);
        const branch = _branches.find(b => b.id === branchId);
        if (s) { s.branchId = branchId; s.branchName = branch?.name || null; }
        const branchCell = document.querySelector(`.sl-branch-cell[data-id="${CSS.escape(id)}"]`);
        if (branchCell && s) branchCell.innerHTML = _renderBranchCell(s);
        showToast('Филиал назначен');
      } catch {
        showToast('Ошибка назначения филиала', true);
      }
      return;
    }

    // Active toggle
    const chk = e.target.closest('.sl-active-chk');
    if (chk) {
      const id      = chk.dataset.id;
      const checked = chk.checked;
      chk.disabled  = true;
      try {
        await updateStaffActive(id, checked);
        const s = _all.find(x => x.id === id);
        if (s) s.isActive = checked;
        chk.closest('tr').classList.toggle('sl-inactive', !checked);
        showToast(checked ? 'Сотрудник активирован' : 'Сотрудник деактивирован');
      } catch {
        chk.checked = !checked;
        showToast('Ошибка', true);
      } finally {
        chk.disabled = false;
      }
    }
  });

  // Edit button click
  document.getElementById('staffTbody').addEventListener('click', e => {
    const editBtn = e.target.closest('.sl-edit-btn');
    if (!editBtn) return;
    const s = _all.find(x => x.id === editBtn.dataset.id);
    if (s) openModal(s);
  });

  // Bind client search (runs once; the handler tolerates modal open/close cycles)
  _bindClientSearch();

  // Add staff button
  document.getElementById('addStaffBtn').addEventListener('click', () => openModal(null));

  // Modal events
  document.getElementById('staffModal').addEventListener('click', e => {
    if (e.target === document.getElementById('staffModal')) closeModal();
  });
  document.getElementById('smCloseBtn').addEventListener('click',  closeModal);
  document.getElementById('smCancelBtn').addEventListener('click', closeModal);
  document.getElementById('smRole').addEventListener('change', _updateBranchField);
  document.getElementById('smSaveBtn').addEventListener('click', _handleSave);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'a-toast show' + (isError ? ' a-toast--error' : '');
  setTimeout(() => t.classList.remove('show'), 3000);
}

init();
