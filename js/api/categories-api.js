// ================================
//  CATEGORIES API — Supabase
//  Table: categories
//  Fields: id, title, slug, sort_order, is_active
// ================================

import { sbFetch }    from './supabase-client.js';
import { API_CONFIG } from '../config/api-config.js';

const TABLE = API_CONFIG.SUPABASE.TABLES.CATEGORIES;

export function fromCategory(row) {
  return {
    id:        row.id,
    title:     row.title     || '',
    slug:      row.slug      || '',
    sortOrder: Number(row.sort_order) || 0,
    isActive:  row.is_active ?? true,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getCategories(activeOnly = false) {
  const filter = activeOnly ? '&is_active=eq.true' : '';
  const rows   = await sbFetch(`/${TABLE}?order=sort_order.asc,title.asc${filter}`);
  return Array.isArray(rows) ? rows.map(fromCategory) : [];
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createCategory(data) {
  const rows = await sbFetch(`/${TABLE}`, {
    method:  'POST',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({
      title:      data.title,
      slug:       data.slug,
      sort_order: data.sortOrder || 0,
      is_active:  data.isActive !== false,
    }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromCategory(row) : null;
}

export async function updateCategory(id, data) {
  const payload = {};
  if (data.title     !== undefined) payload.title      = data.title;
  if (data.slug      !== undefined) payload.slug       = data.slug;
  if (data.sortOrder !== undefined) payload.sort_order = data.sortOrder;
  if (data.isActive  !== undefined) payload.is_active  = data.isActive;

  const rows = await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(payload),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromCategory(row) : null;
}

export async function deleteCategory(id) {
  await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Count products that use a given category slug.
// Products table stores category as a string slug, not a foreign key.
export async function countProductsInCategory(slug) {
  const rows = await sbFetch(`/products?category=eq.${encodeURIComponent(slug)}&select=id`);
  return Array.isArray(rows) ? rows.length : 0;
}
