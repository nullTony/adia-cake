// ================================
//  STAFF API — Supabase
//  Table: staff_users
//  All reads/writes go through SECURITY DEFINER RPCs.
//  Direct REST to staff_users is blocked by RLS.
// ================================

import { sbFetch } from './supabase-client.js';

export function fromStaff(row) {
  return {
    id:               row.id,
    name:             row.full_name          || '',
    phone:            row.phone              || '',
    role:             row.role               || 'manager',
    isActive:         row.is_active          ?? true,
    branchId:         row.branch_id          || null,
    branchName:       row.branches?.name     || null,
    telegramId:       row.telegram_chat_id   ? String(row.telegram_chat_id) : null,
    createdAt:        row.created_at         || '',
    extraPermissions: Array.isArray(row.extra_permissions) ? row.extra_permissions : [],
    type:             'staff',
  };
}

function _clean(phone) {
  return '+' + (phone || '').replace(/\D/g, '');
}

function _rpcRow(result) {
  if (result && !Array.isArray(result)) return result;
  if (Array.isArray(result) && result.length) return result[0];
  return null;
}

// ── Supabase Auth email lookup ────────────────────────────────────────────────
// RPC get_staff_email_by_phone returns a virtual email "9XXXXXXXXX@adia.app"
// that maps the staff phone to their Supabase Auth account.

export async function getStaffEmailByPhone(phone) {
  const clean = _clean(phone);
  const result = await sbFetch('/rpc/get_staff_email_by_phone', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_phone: clean }),
  });
  // RPC returns either a plain string or { email: '...' } depending on definition
  if (typeof result === 'string') return result;
  if (result?.email) return result.email;
  // Fallback: derive email from raw phone string if RPC is unavailable
  if (!result && clean !== phone) {
    const r2 = await sbFetch('/rpc/get_staff_email_by_phone', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ p_phone: phone }),
    });
    if (typeof r2 === 'string') return r2;
    if (r2?.email) return r2.email;
  }
  return null;
}

// ── Phone lookup — NO password in response ────────────────────────────────────

export async function getStaffByPhone(phone) {
  const clean = _clean(phone);
  let result = await sbFetch(`/rpc/get_staff_by_phone`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_phone: clean }),
  });
  let row = _rpcRow(result);
  // Fallback: try raw phone string if E.164 normalisation differs
  if (!row && clean !== phone) {
    result = await sbFetch(`/rpc/get_staff_by_phone`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ p_phone: phone }),
    });
    row = _rpcRow(result);
  }
  return row ? fromStaff(row) : null;
}

// ── Server-side password verification ─────────────────────────────────────────
// Returns fromStaff object on success; null for wrong phone / inactive / wrong password.
// The password value never leaves the server.

export async function verifyStaffLogin(phone, password) {
  const clean = _clean(phone);
  let result = await sbFetch(`/rpc/verify_staff_login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_phone: clean, p_password: password }),
  });
  let row = _rpcRow(result);
  if (!row && clean !== phone) {
    result = await sbFetch(`/rpc/verify_staff_login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ p_phone: phone, p_password: password }),
    });
    row = _rpcRow(result);
  }
  return row ? fromStaff(row) : null;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getStaffById(id) {
  if (!id) return null;
  const result = await sbFetch(`/rpc/get_staff_by_id`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_id: id }),
  });
  const row = _rpcRow(result);
  return row ? fromStaff(row) : null;
}

// Returns the authenticated staff member's profile using auth.uid() from the JWT.
// Requires a valid Supabase Auth session (JWT set via setAuthToken).
export async function getMyStaffProfile() {
  const result = await sbFetch('/rpc/get_my_staff_profile', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({}),
  });
  const row = _rpcRow(result);
  return row ? fromStaff(row) : null;
}

// ── Admin management (SECURITY DEFINER RPCs) ──────────────────────────────────

export async function getAllStaff(search = '') {
  const rows = await sbFetch(`/rpc/get_all_staff_users`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_search: search }),
  });
  return Array.isArray(rows) ? rows.map(fromStaff) : [];
}

export async function updateStaffRole(id, role) {
  return sbFetch(`/rpc/update_staff_role`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_id: id, p_role: role }),
  });
}

export async function updateStaffActive(id, isActive) {
  return sbFetch(`/rpc/update_staff_active`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_id: id, p_is_active: isActive }),
  });
}

export async function promoteToStaff(phone, fullName, role) {
  return sbFetch(`/rpc/promote_to_staff`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_phone: phone, p_full_name: fullName, p_role: role }),
  });
}

// Kept for backward compatibility — routes through RPC, no direct REST
export async function getStaffWithBranches() {
  return getAllStaff('');
}

export async function createStaff(data) {
  const result = await sbFetch(`/rpc/create_staff_user`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      p_full_name:         data.name,
      p_phone:             data.phone,
      p_password:          data.password,
      p_role:              data.role,
      p_branch_id:         data.branchId || null,
      p_extra_permissions: data.extraPermissions || [],
    }),
  });
  const row = _rpcRow(result);
  return row ? fromStaff(row) : null;
}

export async function updateStaff(id, data) {
  const payload = { p_id: id };
  if (data.name     !== undefined) payload.p_full_name         = data.name;
  if (data.phone    !== undefined) payload.p_phone             = data.phone;
  if (data.password)               payload.p_password          = data.password;
  if (data.role     !== undefined) payload.p_role              = data.role;
  // p_set_branch_id signals that branch_id must be written (even when the new value is null)
  if ('branchId' in data) {
    payload.p_set_branch_id = true;
    payload.p_branch_id     = data.branchId || null;
  }
  if (data.isActive          !== undefined) payload.p_is_active          = data.isActive;
  if (data.extraPermissions !== undefined) payload.p_extra_permissions = data.extraPermissions;

  const result = await sbFetch(`/rpc/update_staff_user`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const row = _rpcRow(result);
  return row ? fromStaff(row) : null;
}

export async function checkStaffPhone(phone) {
  const result = await sbFetch(`/rpc/check_staff_phone_exists`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_phone: phone }),
  });
  // RPC returns a uuid string or null
  return result ? { id: result } : null;
}

export async function updateStaffTelegramChatId(id, chatId) {
  await sbFetch(`/rpc/update_staff_telegram`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_id: id, p_chat_id: chatId }),
  });
}

// Look up clients table for a matching phone; returns the telegram_chat_id or null.
export async function copyChatIdFromClient(phone) {
  const rows = await sbFetch(
    `/clients?phone=eq.${encodeURIComponent(phone)}&select=telegram_chat_id&limit=1`
  );
  return (Array.isArray(rows) && rows[0]?.telegram_chat_id) ? rows[0].telegram_chat_id : null;
}
