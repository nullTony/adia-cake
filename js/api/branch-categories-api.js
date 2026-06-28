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
 *
 * Performance: uses PostgREST resource embedding to fetch branch bindings +
 * category rows in ONE round-trip (FK: branch_categories.category_id → categories.id).
 * Falls back to parallel Promise.all if embedding is unavailable.
 */
export async function getActiveCategoriesForBranch(branchId) {
  if (!branchId) return [];

  const CAT_COLS = 'id,title,slug,sort_order,is_active,image_url,is_popular,external_link,created_at';

  try {
    // One round-trip: embed categories via the category_id FK
    const rows = await sbFetch(
      `/${TABLE}?branch_id=eq.${encodeURIComponent(branchId)}&is_active=eq.true` +
      `&select=categories!inner(${CAT_COLS})` +
      `&order=sort_order.asc`
    );

    if (!Array.isArray(rows) || !rows.length) {
      return await sbFetch('/categories?is_active=eq.true&order=sort_order.asc');
    }

    // Extract embedded category objects; sort by their global sort_order (matches
    // the original second-query ordering — categories.sort_order.asc)
    const cats = rows
      .map(bc => bc.categories)
      .filter(c => c && c.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    return cats.length
      ? cats
      : await sbFetch('/categories?is_active=eq.true&order=sort_order.asc');

  } catch {
    // Embedding unavailable (table not yet created, FK not configured, or RLS blocks
    // the join) — fall back to two parallel fetches and intersect client-side
    return _parallelFallback(branchId);
  }
}

// Parallel fallback: fetch bindings + all categories concurrently, intersect on client.
// Still ~2× faster than the old sequential approach when embedding fails.
async function _parallelFallback(branchId) {
  try {
    const [bindings, allCats] = await Promise.all([
      sbFetch(`/${TABLE}?branch_id=eq.${encodeURIComponent(branchId)}&is_active=eq.true`),
      sbFetch('/categories?is_active=eq.true&order=sort_order.asc'),
    ]);
    if (!Array.isArray(bindings) || !bindings.length) {
      return Array.isArray(allCats) ? allCats : [];
    }
    const allowed = new Set(bindings.map(bc => bc.category_id));
    return Array.isArray(allCats) ? allCats.filter(c => allowed.has(c.id)) : [];
  } catch {
    return sbFetch('/categories?is_active=eq.true&order=sort_order.asc').catch(() => []);
  }
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
