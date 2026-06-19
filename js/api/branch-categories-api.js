// ================================
//  BRANCH CATEGORIES API
//  Table: branch_categories
// ================================
import { sbFetch } from './supabase-client.js';

const TABLE = 'branch_categories';

/**
 * Get categories active for a branch.
 * Always returns raw Supabase category rows (caller applies fromCategory).
 * Falls back to all active global categories if:
 *   - branch has no explicit bindings, or
 *   - branch_categories table doesn't exist yet (graceful pre-migration fallback)
 */
export async function getActiveCategoriesForBranch(branchId) {
  if (!branchId) return [];

  let bindings;
  try {
    bindings = await sbFetch(`/${TABLE}?branch_id=eq.${encodeURIComponent(branchId)}&is_active=eq.true&order=sort_order.asc`);
  } catch {
    // Table not yet created — fall back to all active categories
    return await sbFetch('/categories?is_active=eq.true&order=sort_order.asc');
  }

  if (!Array.isArray(bindings) || !bindings.length) {
    return await sbFetch('/categories?is_active=eq.true&order=sort_order.asc');
  }

  const ids = bindings.map(bc => bc.category_id).join(',');
  return await sbFetch(`/categories?id=in.(${ids})&is_active=eq.true&order=sort_order.asc`);
}

/** All branch_categories rows for a branch (admin use). */
export async function getBranchCategories(branchId) {
  const rows = await sbFetch(`/${TABLE}?branch_id=eq.${encodeURIComponent(branchId)}&order=sort_order.asc`);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Toggle a category for a branch. Creates binding if missing (upsert via PATCH+POST).
 */
export async function toggleBranchCategory(branchId, categoryId, isActive) {
  const existing = await sbFetch(
    `/${TABLE}?branch_id=eq.${encodeURIComponent(branchId)}&category_id=eq.${encodeURIComponent(categoryId)}`
  ).then(r => (Array.isArray(r) ? r[0] : null));

  if (existing) {
    return await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ is_active: isActive }),
    }).then(r => (Array.isArray(r) ? r[0] : r));
  }

  return await sbFetch(`/${TABLE}`, {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ branch_id: branchId, category_id: categoryId, is_active: isActive, sort_order: 0 }),
  }).then(r => (Array.isArray(r) ? r[0] : r));
}

/** Toggle is_popular for a category within a branch. Creates binding if missing. */
export async function toggleBranchCategoryPopularity(branchId, categoryId, isPopular) {
  const existing = await sbFetch(
    `/${TABLE}?branch_id=eq.${encodeURIComponent(branchId)}&category_id=eq.${encodeURIComponent(categoryId)}`
  ).then(r => (Array.isArray(r) ? r[0] : null));

  if (existing) {
    return await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ is_popular: isPopular }),
    }).then(r => (Array.isArray(r) ? r[0] : r));
  }

  return await sbFetch(`/${TABLE}`, {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ branch_id: branchId, category_id: categoryId, is_active: true, is_popular: isPopular, sort_order: 0 }),
  }).then(r => (Array.isArray(r) ? r[0] : r));
}

/** Update sort_order of a category within a branch. */
export async function updateBranchCategoryOrder(branchId, categoryId, sortOrder) {
  const existing = await sbFetch(
    `/${TABLE}?branch_id=eq.${encodeURIComponent(branchId)}&category_id=eq.${encodeURIComponent(categoryId)}`
  ).then(r => (Array.isArray(r) ? r[0] : null));
  if (!existing) return null;
  return await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(existing.id)}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ sort_order: sortOrder }),
  }).then(r => (Array.isArray(r) ? r[0] : r));
}

/**
 * Seed a branch with all active global categories (safe — checks if already seeded).
 */
export async function seedBranchCategories(branchId) {
  const existing = await getBranchCategories(branchId);
  if (existing.length > 0) return existing;
  const cats = await sbFetch('/categories?is_active=eq.true&order=sort_order.asc');
  if (!Array.isArray(cats) || !cats.length) return [];
  const rows = cats.map((c, i) => ({ branch_id: branchId, category_id: c.id, is_active: true, sort_order: i }));
  return await sbFetch(`/${TABLE}`, {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(rows),
  });
}
