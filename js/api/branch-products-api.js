// ================================
//  BRANCH PRODUCTS API — Supabase backend
//
//  Table "branch_products":
//    id, branch_id, product_id,
//    is_available_today (bool, default false),
//    is_popular (bool, default false),
//    showcase_order (int, default 0),
//    created_at
// ================================

import { sbFetch }    from './supabase-client.js';
import { API_CONFIG } from '../config/api-config.js';

const TABLE = API_CONFIG.SUPABASE.TABLES.BRANCH_PRODUCTS;

const PRODUCT_COLS = 'id,title,description,price,category,photo,in_stock,unit_type,weight_step,min_weight,max_weight,sort_order';

function rowToProduct(row) {
  const p = row.products;
  if (!p) return null;
  return {
    id:              p.id,
    title:           p.title           || '',
    description:     p.description     || '',
    price:           Number(p.price)   || 0,
    category:        p.category        || '',
    photo:           p.photo           || '',
    inStock:         p.in_stock !== false,
    unitType:        p.unit_type        || 'piece',
    weightStep:      p.weight_step != null ? Number(p.weight_step) : null,
    minWeight:       p.min_weight  != null ? Number(p.min_weight)  : null,
    maxWeight:       p.max_weight  != null ? Number(p.max_weight)  : null,
    sortOrder:       row.showcase_order || 0,
    isTodayShowcase: row.is_available_today || false,
    isPopular:       row.is_popular     || false,
    branchProductId: row.id,
  };
}

// ── Customer-facing ───────────────────────────────────────────────────────────

// Products available today for a branch. popularOnly=true → also filter is_popular.
export async function getBranchProducts(branchId, { popularOnly = false, limit = null } = {}) {
  let url = `/${TABLE}?branch_id=eq.${branchId}&is_available_today=eq.true`
    + `&select=id,is_available_today,is_popular,showcase_order,products!inner(${PRODUCT_COLS})`
    + `&products.in_stock=eq.true`
    + `&order=showcase_order.asc`;
  if (popularOnly) url += '&is_popular=eq.true';
  if (limit)       url += `&limit=${limit}`;

  const rows = await sbFetch(url);
  if (!Array.isArray(rows)) return [];
  return rows.map(rowToProduct).filter(Boolean);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

// All branch_products rows for a branch (admin view — includes unavailable).
export async function getBranchProductsAdmin(branchId) {
  const rows = await sbFetch(
    `/${TABLE}?branch_id=eq.${branchId}`
    + `&select=id,branch_id,product_id,is_available_today,is_popular,showcase_order`
    + `&order=showcase_order.asc,created_at.asc`
  );
  return Array.isArray(rows) ? rows : [];
}

// Batch upsert. Requires unique constraint on (branch_id, product_id).
export async function upsertBranchProducts(branchId, items) {
  const data = items.map(item => ({
    branch_id:          branchId,
    product_id:         item.productId,
    is_available_today: item.isAvailableToday,
    is_popular:         item.isPopular,
    showcase_order:     item.showcaseOrder || 0,
  }));

  return sbFetch(`/${TABLE}?on_conflict=branch_id,product_id`, {
    method:  'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body:    JSON.stringify(data),
  });
}

// Update a single branch_products row by its id.
export async function updateBranchProduct(id, data) {
  const payload = {};
  if (data.isAvailableToday !== undefined) payload.is_available_today = data.isAvailableToday;
  if (data.isPopular        !== undefined) payload.is_popular         = data.isPopular;
  if (data.showcaseOrder    !== undefined) payload.showcase_order     = data.showcaseOrder;

  const rows = await sbFetch(`/${TABLE}?id=eq.${id}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(payload),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

// Remove product from branch.
export async function removeBranchProduct(id) {
  await sbFetch(`/${TABLE}?id=eq.${id}`, { method: 'DELETE' });
}

// When a product is archived, clear it from all branches so it never surfaces in showcase.
export async function clearProductFromBranches(productId) {
  await sbFetch(`/${TABLE}?product_id=eq.${encodeURIComponent(productId)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body:    JSON.stringify({ is_available_today: false, is_popular: false }),
  });
}
