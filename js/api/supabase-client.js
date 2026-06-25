// ================================
//  SUPABASE CLIENT
//  Lightweight fetch wrapper for Supabase PostgREST.
//  Base path: {SUPABASE.URL}/rest/v1/{table}
// ================================

import { API_CONFIG } from '../config/api-config.js';

const { URL: BASE_URL, ANON_KEY } = API_CONFIG.SUPABASE;

function buildHeaders(extra = {}) {
  return {
    'Content-Type':  'application/json',
    'apikey':        ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
    ...extra,
  };
}

// path  — everything after /rest/v1, e.g. "/products?order=sort_order.asc"
// options.headers — merged on top of default Supabase headers
export async function sbFetch(path, options = {}) {
  const method  = options.method || 'GET';
  const url     = `${BASE_URL}/rest/v1${path}`;
  const headers = buildHeaders(options.headers || {});

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let res;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (networkErr) {
    if (networkErr.name === 'AbortError') {
      const timeoutErr = new Error('Request timeout');
      timeoutErr.name = 'TimeoutError';
      console.error('[supabase] Request timed out:', url);
      throw timeoutErr;
    }
    console.error('[supabase] Network error:', networkErr);
    throw networkErr;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;

  const text = await res.text();

  if (!res.ok) {
    let err = {};
    try { err = JSON.parse(text); } catch {}
    console.error(`[supabase] ${method} ${url} failed:`, err);
    throw new Error(err.message || `Supabase ${res.status}`);
  }

  if (!text) return null;
  return JSON.parse(text);
}
