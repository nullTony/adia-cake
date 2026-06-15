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

// Returns only active branches, ordered by sort_order asc.
export async function getBranches() {
  const rows = await sbFetch(
    `/${TABLE}?select=id,name,address,phone,working_hours,maps_url,map_widget_url,is_active,sort_order&is_active=eq.true&order=sort_order.asc`
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(fromSupabase);
}
