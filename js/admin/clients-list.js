// ================================
//  ADMIN — CLIENTS LIST
// ================================

import { getSession, ensureAuth }                                   from './auth.js';
import { initRbac }                                                from './rbac.js';
import { getAllClients, updateClient }                               from '../api/clients-api.js';
import { getAllStaff, promoteToStaff,
         updateStaffRole, updateStaffActive,
         getStaffByPhoneWithPassword }                              from '../api/staff-api.js';
import { initAdminNotifications }                                   from '../services/notification-service.js';
import { createTableSkeletons }                                     from '../utils/skeleton.js';
import { esc, formatDateOnly }                                      from '../utils/format.js';

initRbac('staff');
initAdminNotifications();

// ── Config ────────────────────────────────────────────────────────────────────

const ROLE_LABELS = {
  super_admin: 'Управляющий',
  admin:       'Администратор',
  manager:     'Менеджер',
  operator:    'Оператор',
};

// Roles ordered lowest → highest. Used to determine what a user may assign.
const ROLE_RANK = ['operator', 'manager', 'admin', 'super_admin'];

// Returns roles the current user is allowed to assign.
// Each role may assign roles up to and including their own level;
// the "owner" option is additionally gated to owner-level staff only.
function _assignableRoles(myRole) {
  const myIdx = ROLE_RANK.indexOf(myRole);
  if (myIdx === -1) return ['manager'];
  return ROLE_RANK.slice(0, myIdx + 1);
}

// ── State ─────────────────────────────────────────────────────────────────────

let _all           = [];
let _filtered      = [];
let _staffPhoneMap = new Map(); // phone → current role, for duplicate-check rendering
let _myRole        = 'manager';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name) {
  return (name || '?').trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderTable(clients) {
  const tbody = document.getElementById('clientsTbody');
  const empty = document.getElementById('clientsEmpty');
  const count = document.getElementById('clientsCount');

  count.textContent = clients.length;

  if (!clients.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = clients.map(c => {
    const staffRole = _staffPhoneMap.get(c.phone);

    let actionCell;
    if (staffRole) {
      // Already a staff member — show current role as a badge
      actionCell = `<span class="cl-staff-badge">${esc(ROLE_LABELS[staffRole] || staffRole)} ✓</span>`;
    } else {
      // Not staff — show promote button (only for admin/owner)
      actionCell = _assignableRoles(_myRole).length > 0
        ? `<button class="cl-promote-btn" data-id="${esc(c.id)}" data-phone="${esc(c.phone)}" data-name="${esc(c.name)}">Назначить роль</button>`
        : '—';
    }

    return `
    <tr data-id="${esc(c.id)}">
      <td>
        <div class="cl-user">
          <div class="cl-avatar">${esc(initials(c.name))}</div>
          <div class="cl-user-info">
            <div class="cl-user-name">${esc(c.name || '—')}</div>
            <div class="cl-user-phone">${esc(c.phone)}</div>
          </div>
        </div>
      </td>
      <td>
        ${c.telegramId
          ? `<span class="cl-tg-badge cl-tg-yes">✓ Привязан</span>`
          : `<span class="cl-tg-badge cl-tg-no">Не привязан</span>`}
      </td>
      <td>
        <label class="cl-toggle" title="${c.isVerified ? 'Верифицирован' : 'Не верифицирован'}">
          <input type="checkbox" class="cl-verified-chk" data-id="${esc(c.id)}" ${c.isVerified ? 'checked' : ''}>
          <span class="cl-toggle-track"></span>
        </label>
      </td>
      <td>${formatDateOnly(c.createdAt)}</td>
      <td>${actionCell}</td>
    </tr>`;
  }).join('');
}

// ── Filter ────────────────────────────────────────────────────────────────────

function applyFilter(query) {
  const q = (query || '').toLowerCase().trim();
  _filtered = q
    ? _all.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q))
    : [..._all];
  renderTable(_filtered);
}

// ── Promote modal ─────────────────────────────────────────────────────────────

let _promoteTarget = null;

function openPromote(id, phone, name) {
  _promoteTarget = { id, phone, name };
  document.getElementById('promoteModalName').textContent = name || phone;

  // Populate role options filtered to what this admin may assign
  const roles  = _assignableRoles(_myRole);
  const select = document.getElementById('promoteRole');
  select.innerHTML = roles.map(r =>
    `<option value="${r}">${ROLE_LABELS[r] || r}</option>`
  ).join('');
  select.value = roles[0]; // default to lowest assignable role

  document.getElementById('promoteError').textContent = '';
  document.getElementById('promoteModal').classList.add('open');
}

function closePromote() {
  document.getElementById('promoteModal').classList.remove('open');
  _promoteTarget = null;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  if (!await ensureAuth()) return;
  const session = getSession();
  _myRole = session?.role || 'manager';
  document.getElementById('adminUser').textContent = session?.full_name || _myRole;

  document.getElementById('logoutBtn').addEventListener('click', () => {
    import('./auth.js').then(m => m.logout());
  });

  const tbody = document.getElementById('clientsTbody');
  tbody.innerHTML = createTableSkeletons(5, 5);

  try {
    // Load clients and staff in parallel so we can show the badge immediately
    const [clients, staffList] = await Promise.all([
      getAllClients(),
      getAllStaff().catch(() => []),
    ]);

    _staffPhoneMap = new Map(staffList.map(s => [s.phone, s.role]));
    _all      = clients;
    _filtered = [..._all];
    renderTable(_filtered);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#c0392b">${esc(err.message)}</td></tr>`;
    return;
  }

  // Search
  document.getElementById('searchInput').addEventListener('input', e => applyFilter(e.target.value));

  // Verified toggle (delegated)
  document.getElementById('clientsTbody').addEventListener('change', async e => {
    const chk = e.target.closest('.cl-verified-chk');
    if (!chk) return;
    const id      = chk.dataset.id;
    const checked = chk.checked;
    chk.disabled = true;
    try {
      await updateClient(id, { isVerified: checked });
      const c = _all.find(x => x.id === id);
      if (c) c.isVerified = checked;
    } catch {
      chk.checked = !checked; // revert on error
    } finally {
      chk.disabled = false;
    }
  });

  // Promote button (delegated)
  document.getElementById('clientsTbody').addEventListener('click', e => {
    const btn = e.target.closest('.cl-promote-btn');
    if (!btn) return;
    openPromote(btn.dataset.id, btn.dataset.phone, btn.dataset.name);
  });

  // Promote modal — backdrop click closes
  document.getElementById('promoteModal').addEventListener('click', e => {
    if (e.target === document.getElementById('promoteModal')) closePromote();
  });
  document.getElementById('promoteCancelBtn').addEventListener('click', closePromote);

  // Promote confirm — upsert staff record
  document.getElementById('promoteConfirmBtn').addEventListener('click', async () => {
    if (!_promoteTarget) return;
    const role  = document.getElementById('promoteRole').value;
    const errEl = document.getElementById('promoteError');
    const btn   = document.getElementById('promoteConfirmBtn');
    errEl.textContent = '';
    btn.disabled = true;

    try {
      // Check if this phone already exists in staff_users
      const existing = await getStaffByPhoneWithPassword(_promoteTarget.phone).catch(() => null);

      if (existing) {
        // Update role + ensure active
        await updateStaffRole(existing.id, role);
        await updateStaffActive(existing.id, true);
      } else {
        // Insert new staff record
        await promoteToStaff(_promoteTarget.phone, _promoteTarget.name, role);
      }

      // Update local map so badge renders immediately on re-render
      _staffPhoneMap.set(_promoteTarget.phone, role);

      closePromote();
      renderTable(_filtered);
      showToast(`${_promoteTarget.name || _promoteTarget.phone} → ${ROLE_LABELS[role] || role}`);
    } catch (err) {
      errEl.textContent = err.message || 'Ошибка назначения';
    } finally {
      btn.disabled = false;
    }
  });
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
