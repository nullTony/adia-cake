// ================================
//  BRANCHES API — Supabase backend
//
//  Supabase table "branches" (snake_case):
//    id, name, address, phone, working_hours,
//    maps_url, map_widget_url, is_active, sort_order, created_at
// ================================

import { sbFetch }    from './supabase-client.js';
import { API_CONFIG } from '../config/api-config.js';

const TABLE = API_CONFIG.SUPABASE.TABLES.BRANCHES;

function fromSupabase(row) {
  return {
    id:           row.id,
    name:         row.name          || '',
    address:      row.address       || '',
    phone:        row.phone         || '',
    workingHours: row.working_hours || '',
    mapsUrl:      row.maps_url      || '',
    mapWidgetUrl: row.map_widget_url || '',
    isActive:     row.is_active     !== false,
    sortOrder:    Number(row.sort_order) || 0,
  };
}

const BRANCHES_CACHE_KEY = 'adia_branches_v1';
const BRANCHES_CACHE_TTL = 5 * 60 * 1000; // 5 min — branches change rarely

// Returns only active branches, ordered by sort_order asc.
// Cached in localStorage to avoid a network round-trip on every page load.
export async function getBranches() {
  try {
    const cached = JSON.parse(localStorage.getItem(BRANCHES_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < BRANCHES_CACHE_TTL) return cached.data;
  } catch {}

  const rows = await sbFetch(
    `/${TABLE}?select=id,name,address,phone,working_hours,maps_url,map_widget_url,is_active,sort_order&is_active=eq.true&order=sort_order.asc`
  );
  if (!Array.isArray(rows)) return [];
  const result = rows.map(fromSupabase);

  try {
    localStorage.setItem(BRANCHES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result }));
  } catch {}

  return result;
}
