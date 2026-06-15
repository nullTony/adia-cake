// ================================
//  STAFF API — Supabase
//  Table: staff_users
//  Admin/manager accounts.
// ================================

import { sbFetch } from './supabase-client.js';

const TABLE = 'staff_users';

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

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getStaffByPhone(phone) {
  const row = await getStaffByPhoneWithPassword(phone);
  return row ? fromStaff(row) : null;
}

export async function getStaffById(id) {
  if (!id) return null;
  const result = await sbFetch(`/rpc/get_staff_by_id`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_id: id }),
  });
  const row = result && !Array.isArray(result) ? result
    : (Array.isArray(result) && result.length ? result[0] : null);
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


// Direct REST queries (anon read/write allowed per migration RLS)

export async function getStaffWithBranches() {
  const rows = await sbFetch(
    `/${TABLE}?select=id,full_name,phone,role,is_active,created_at,branch_id,telegram_chat_id,extra_permissions&order=created_at.desc`
  );
  return Array.isArray(rows) ? rows.map(fromStaff) : [];
}

export async function createStaff(data) {
  const rows = await sbFetch(`/${TABLE}`, {
    method:  'POST',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({
      full_name:         data.name,
      phone:             data.phone,
      password:          data.password,
      role:              data.role,
      branch_id:         data.branchId || null,
      is_active:         true,
      extra_permissions: data.extraPermissions || [],
    }),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateStaff(id, data) {
  const payload = {};
  if (data.name     !== undefined) payload.full_name          = data.name;
  if (data.phone    !== undefined) payload.phone              = data.phone;
  if (data.password)               payload.password           = data.password;
  if (data.role     !== undefined) payload.role               = data.role;
  if ('branchId' in data)          payload.branch_id          = data.branchId || null;
  if (data.isActive          !== undefined) payload.is_active          = data.isActive;
  if (data.extraPermissions !== undefined) payload.extra_permissions = data.extraPermissions;

  const rows = await sbFetch(`/${TABLE}?id=eq.${id}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(payload),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function checkStaffPhone(phone) {
  const rows = await sbFetch(
    `/${TABLE}?phone=eq.${encodeURIComponent(phone)}&select=id&limit=1`
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function updateStaffTelegramChatId(id, chatId) {
  await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body:    JSON.stringify({ telegram_chat_id: chatId }),
  });
}

// Look up clients table for a matching phone; returns the telegram_chat_id or null.
export async function copyChatIdFromClient(phone) {
  const rows = await sbFetch(
    `/clients?phone=eq.${encodeURIComponent(phone)}&select=telegram_chat_id&limit=1`
  );
  return (Array.isArray(rows) && rows[0]?.telegram_chat_id) ? rows[0].telegram_chat_id : null;
}

// Uses a SECURITY DEFINER RPC to bypass RLS on staff_users
export async function getStaffByPhoneWithPassword(phone) {
  const clean = _clean(phone);
  const result = await sbFetch(`/rpc/check_staff_phone`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_phone: clean }),
  });
  if (result && !Array.isArray(result)) return result; // single jsonb row
  if (Array.isArray(result) && result.length) return result[0];

  // Fallback: try raw phone string if format differs
  if (clean !== phone) {
    const result2 = await sbFetch(`/rpc/check_staff_phone`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ p_phone: phone }),
    });
    if (result2 && !Array.isArray(result2)) return result2;
    if (Array.isArray(result2) && result2.length) return result2[0];
  }
  return null;
}
