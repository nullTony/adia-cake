// ================================
//  PRODUCTS API — Supabase backend
//
//  Supabase table "products" (snake_case):
//    id, title, description, price, category, photo,
//    in_stock, is_today_showcase, is_popular, sort_order,
//    created_at, updated_at
//
//  Public API (camelCase, unchanged):
//    getProducts()           → Product[]
//    getProductById(id)      → Product | null
//    createProduct(payload)  → Product
//    updateProduct(id, data) → Product
//    deleteProduct(id)       → void
// ================================

import { sbFetch }      from './supabase-client.js';
import { API_CONFIG }   from '../config/api-config.js';

const TABLE = API_CONFIG.SUPABASE.TABLES.PRODUCTS;

// ── Normalization ─────────────────────────────────────────────────────────────

function _bool(val, defaultVal = false) {
  if (val === true  || val === 'true'  || val === 1 || val === '1') return true;
  if (val === false || val === 'false' || val === 0 || val === '0') return false;
  return defaultVal;
}

// Supabase row (snake_case) → frontend object (camelCase)
function fromSupabase(row) {
  return {
    id:              row.id,
    title:           row.title           || '',
    description:     row.description     || '',
    price:           Number(row.price)   || 0,
    category:        row.category        || '',
    photo:           row.photo           || '',
    inStock:         _bool(row.in_stock,          true),
    isTodayShowcase: _bool(row.is_today_showcase, false),
    isPopular:       _bool(row.is_popular,        false),
    sortOrder:       Number(row.sort_order)       || 0,
    unitType:        row.unit_type        || 'piece',
    weightStep:      row.weight_step != null ? Number(row.weight_step) : null,
    minWeight:       row.min_weight  != null ? Number(row.min_weight)  : null,
    maxWeight:       row.max_weight  != null ? Number(row.max_weight)  : null,
    createdAt:       row.created_at      || '',
    updatedAt:       row.updated_at      || '',
  };
}

// Frontend payload (camelCase) → Supabase row (snake_case)
// Only maps fields that are explicitly present — id and createdAt are excluded (DB sets them).
function toSupabase(payload) {
  const row = {};
  if (payload.title           !== undefined) row.title             = payload.title;
  if (payload.description     !== undefined) row.description       = payload.description;
  if (payload.price           !== undefined) row.price             = payload.price;
  if (payload.category        !== undefined) row.category          = payload.category;
  if (payload.photo           !== undefined) row.photo             = payload.photo;
  if (payload.inStock         !== undefined) row.in_stock          = payload.inStock;
  if (payload.isTodayShowcase !== undefined) row.is_today_showcase = payload.isTodayShowcase;
  if (payload.isPopular       !== undefined) row.is_popular        = payload.isPopular;
  if (payload.sortOrder       !== undefined) row.sort_order        = payload.sortOrder;
  if (payload.unitType        !== undefined) row.unit_type         = payload.unitType;
  if (payload.weightStep      !== undefined) row.weight_step       = payload.weightStep ?? null;
  if (payload.minWeight       !== undefined) row.min_weight        = payload.minWeight  ?? null;
  if (payload.maxWeight       !== undefined) row.max_weight        = payload.maxWeight  ?? null;
  if (payload.updatedAt       !== undefined) row.updated_at        = payload.updatedAt;
  return row;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getProducts() {
  const rows = await sbFetch(`/${TABLE}?order=sort_order.asc,created_at.desc`);
  if (!Array.isArray(rows)) return [];
  return rows.map(fromSupabase);
}

export async function getProductById(id) {
  const rows = await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`);
  if (!Array.isArray(rows) || !rows.length) return null;
  return fromSupabase(rows[0]);
}

export async function createProduct(payload) {
  const rows = await sbFetch(`/${TABLE}`, {
    method:  'POST',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(toSupabase(payload)),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromSupabase(row) : null;
}

export async function updateProduct(id, payload) {
  const rows = await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(toSupabase(payload)),
  });
  if (Array.isArray(rows) && rows.length === 0) {
    throw new Error('Товар не найден или RLS запрещает обновление (проверь политики в Supabase Dashboard)');
  }
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromSupabase(row) : null;
}

export async function deleteProduct(id) {
  await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
}
