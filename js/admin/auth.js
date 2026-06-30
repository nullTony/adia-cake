// ================================
//  ADMIN AUTH — Supabase staff_users + Supabase Auth JWT
//
//  login(email, password):
//    Authenticates via Supabase Auth, then loads the staff profile
//    using get_my_staff_profile() which identifies the user from auth.uid() in the JWT.
// ================================

import { getMyStaffProfile, getStaffById } from '../api/staff-api.js';
import { signInWithEmailPassword, signOut, getActiveSession } from '../api/supabase-auth.js';
import { setAuthToken, clearAuthToken }                      from '../api/supabase-client.js';

const SESSION_KEY = 'adia_staff';

// ── Session helpers ───────────────────────────────────────────────────────────

function _readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

// ── login ─────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  // 1. Authenticate with Supabase Auth — supabase-js stores refresh_token automatically
  const { accessToken } = await signInWithEmailPassword(email, password);

  // 2. Inject JWT into sbFetch so get_my_staff_profile can read auth.uid()
  setAuthToken(accessToken);

  // 3. Load staff profile via JWT identity — no phone derivation needed
  const staff = await getMyStaffProfile();
  if (!staff) throw new Error('Неверный email или пароль');

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id:                staff.id,
    full_name:         staff.name,
    role:              staff.role,
    branch_id:         staff.branchId || null,
    phone:             staff.phone,
    extra_permissions: staff.extraPermissions || [],
    telegram_chat_id:  staff.telegramId || null,
    staff_email:       email,
  }));
  return staff;
}

// ── logout ────────────────────────────────────────────────────────────────────

export async function logout() {
  clearAuthToken();
  await signOut(); // clears supabase-js sb-*-auth-token from localStorage
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

// ── ensureAuth ────────────────────────────────────────────────────────────────
// Async guard for admin pages. Must be awaited at the top of every init()
// before any Supabase data calls — guarantees JWT is set in sbFetch.
// Returns the raw session object on success, null after initiating redirect.

export async function ensureAuth() {
  const s = _readSession();
  if (!s?.id) {
    window.location.replace('login.html');
    return null;
  }
  try {
    const token = await getActiveSession();
    if (!token) {
      // Supabase Auth refresh token expired — force re-login
      localStorage.removeItem(SESSION_KEY);
      window.location.replace('login.html');
      return null;
    }
    setAuthToken(token);
  } catch (err) {
    // Network error — JWT already set by getActiveSession if in-memory session exists;
    // proceed and let individual fetch calls surface errors naturally.
    console.warn('[admin-auth] ensureAuth: JWT restore failed:', err.message);
  }
  return s;
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
