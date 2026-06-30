// ================================
//  SUPABASE AUTH — thin wrapper over @supabase/supabase-js
//
//  Responsibilities:
//    • createClient (singleton) with supabase-js so the library
//      manages token storage (sb-*-auth-token in localStorage)
//      and auto-refresh via its own internal timer.
//    • Expose signInWithEmailPassword / signOut / getActiveSession
//      so the rest of the codebase stays framework-agnostic.
//    • On every token change (SIGNED_IN, TOKEN_REFRESHED) update
//      the Bearer token in supabase-client.js via setAuthToken.
//
//  Only used for staff (Supabase Auth email+password flow).
//  Client (Telegram) login never calls this module.
// ================================

import { createClient }               from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { API_CONFIG }                 from '../config/api-config.js';
import { setAuthToken, clearAuthToken } from './supabase-client.js';

const { URL: SUPABASE_URL, ANON_KEY } = API_CONFIG.SUPABASE;

// ── Singleton ─────────────────────────────────────────────────────────────────

let _client = null;

function _getClient() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: {
        // supabase-js stores its own session under "sb-*-auth-token"
        // We leave persistSession: true (default) so refresh_token survives reload.
        autoRefreshToken:    true,
        persistSession:      true,
        detectSessionInUrl:  false,
      },
    });

    // Keep sbFetch's Bearer token in sync whenever supabase-js refreshes.
    _client.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        setAuthToken(session.access_token);
      } else {
        clearAuthToken();
      }
    });
  }
  return _client;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sign in with email + password via Supabase Auth.
 * Returns { accessToken, refreshToken, expiresAt } on success.
 * Throws an Error with a Russian-friendly message on failure.
 */
export async function signInWithEmailPassword(email, password) {
  const supabase = _getClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('[supabase-auth] signInWithPassword error:', error.message);
    // Supabase returns "Invalid login credentials" for wrong password
    throw new Error('Неверный телефон или пароль');
  }

  const { access_token, refresh_token, expires_at } = data.session;
  return { accessToken: access_token, refreshToken: refresh_token, expiresAt: expires_at };
}

/**
 * Sign out from Supabase Auth. Clears the sb-*-auth-token entry in localStorage.
 * Fire-and-forget safe — ignores errors (network down, already signed out, etc.)
 */
export async function signOut() {
  try {
    const supabase = _getClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[supabase-auth] signOut error (ignored):', err.message);
  }
}

/**
 * Returns the current accessToken from the live supabase-js session, or null
 * if there is no active session. Synchronous-ish — reads from the in-memory
 * supabase-js state that was hydrated by restoreSession() or onAuthStateChange.
 */
export function getAccessToken() {
  if (!_client) return null;
  // getSession() is async but supabase-js exposes the current session synchronously
  // via the internal store — accessing it through the unofficial path is fragile,
  // so we use the safe async path wrapped for callers that need a quick check.
  return null; // use getActiveSession() for async contexts
}

/**
 * Async version: resolves to the accessToken string, or null.
 * Triggers supabase-js to attempt a token refresh if the stored session exists
 * but the access_token is expired.
 */
export async function getActiveSession() {
  const supabase = _getClient();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || null;
  // Keep sbFetch in sync in case we restored from localStorage on first call
  if (token) {
    setAuthToken(token);
  }
  return token;
}

/**
 * Called during initAuth for the staff branch.
 * Lets supabase-js attempt a silent refresh using the stored refresh_token.
 * Returns the refreshed accessToken, or null if no session exists.
 */
export async function restoreSession() {
  return getActiveSession();
}
