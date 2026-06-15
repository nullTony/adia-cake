// ================================
//  ADMIN AUTH — Supabase staff_users
// ================================

import { getStaffByPhoneWithPassword, getStaffById, fromStaff } from '../api/staff-api.js';
import { sbFetch } from '../api/supabase-client.js';

const SESSION_KEY = 'adia_staff';

// ── Session helpers ───────────────────────────────────────────────────────────

function _readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

// ── login ─────────────────────────────────────────────────────────────────────

export async function login(phone, password) {
  const row = await getStaffByPhoneWithPassword(phone);
  if (!row)           throw new Error('Сотрудник не найден');
  if (!row.is_active) throw new Error('Аккаунт деактивирован');

  // row.password is undefined if the column doesn't exist yet in DB
  const stored = row.password ?? null;
  const valid  = stored !== null ? stored === password : password === 'adia2026';
  if (!valid) throw new Error('Неверный пароль');

  const staff = fromStaff(row);

  // Fetch extra_permissions and telegram_chat_id from REST (RPCs may predate these columns).
  let extraPermissions = staff.extraPermissions || [];
  let telegramChatId   = staff.telegramId || null;
  try {
    const rows = await sbFetch(
      `/staff_users?id=eq.${staff.id}&select=extra_permissions,telegram_chat_id&limit=1`
    );
    if (Array.isArray(rows) && rows[0]) {
      if (rows[0].extra_permissions) extraPermissions = rows[0].extra_permissions;
      telegramChatId = rows[0].telegram_chat_id || null;
    }
  } catch { /* use whatever fromStaff returned */ }

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id:                staff.id,
    full_name:         staff.name,
    role:              staff.role,
    branch_id:         staff.branchId || null,
    phone:             staff.phone,
    extra_permissions: extraPermissions,
    telegram_chat_id:  telegramChatId,
  }));
  return staff;
}

// ── logout ────────────────────────────────────────────────────────────────────

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'login.html';
}

// ── isAuthenticated ───────────────────────────────────────────────────────────

export function isAuthenticated() {
  const s = _readSession();
  return !!(s && s.id);
}

// ── requireAuth ───────────────────────────────────────────────────────────────

export function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = 'login.html';
  }
}

// ── getSession ────────────────────────────────────────────────────────────────

export function getSession() {
  return _readSession();
}

// ── getStaffUser ──────────────────────────────────────────────────────────────

export async function getStaffUser() {
  const s = _readSession();
  if (!s?.id) return null;
  try { return await getStaffById(s.id); }
  catch { return null; }
}
