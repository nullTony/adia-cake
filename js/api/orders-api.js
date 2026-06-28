// ================================
//  ORDERS API — Supabase backend
//
//  Tables:
//    orders      — one row per order
//    order_items — one row per cart line
//
//  Supabase schema (snake_case):
//  orders:
//    id, order_number, customer_name, phone, delivery_type,
//    delivery_address, branch_id, branch_name,
//    comment, status, total_requested_amount, total_confirmed_amount,
//    created_at, updated_at
//
//  order_items:
//    id, order_id, product_id,
//    product_title_snapshot, product_price_snapshot,
//    requested_qty, confirmed_qty, item_status, admin_comment
// ================================

import { sbFetch }    from './supabase-client.js';
import { API_CONFIG } from '../config/api-config.js';

const ORDERS_TBL = API_CONFIG.SUPABASE.TABLES.ORDERS;
const ITEMS_TBL  = API_CONFIG.SUPABASE.TABLES.ORDER_ITEMS;

// ── Normalization ─────────────────────────────────────────────────────────────

export function fromOrder(row) {
  return {
    id:                   row.id,
    orderNumber:          row.order_number != null ? Number(row.order_number) : null,
    userId:               row.user_id             || null,
    customerName:         row.customer_name,
    phone:                row.phone,
    deliveryType:         row.delivery_type,
    deliveryAddress:      row.delivery_address    || null,
    deliveryLat:          row.delivery_lat  != null ? Number(row.delivery_lat)  : null,
    deliveryLng:          row.delivery_lng  != null ? Number(row.delivery_lng)  : null,
    branchId:             row.branch_id           || null,
    branchName:           row.branch_name         || null,
    comment:              row.comment             || null,
    status:               row.status              || 'new',
    cancelReason:         row.cancel_reason       || null,
    totalRequestedAmount: Number(row.total_requested_amount) || 0,
    totalConfirmedAmount: Number(row.total_confirmed_amount) || 0,
    createdAt:            row.created_at          || '',
    updatedAt:            row.updated_at          || '',
  };
}

function toOrder(o) {
  return {
    user_id:                o.userId                || null,
    customer_name:          o.customerName,
    phone:                  o.phone,
    delivery_type:          o.deliveryType,
    delivery_address:       o.deliveryAddress       || null,
    delivery_lat:           o.deliveryLat           ?? null,
    delivery_lng:           o.deliveryLng           ?? null,
    branch_id:              o.branchId              || null,
    branch_name:            o.branchName            || null,
    comment:                o.comment               || null,
    status:                 o.status                || 'new',
    total_requested_amount: o.totalRequestedAmount  || 0,
    total_confirmed_amount: 0,
  };
}

function fromItem(row) {
  return {
    id:                   row.id,
    orderId:              row.order_id,
    productId:            row.product_id,
    productTitleSnapshot: row.product_title_snapshot,
    productPriceSnapshot: Number(row.product_price_snapshot) || 0,
    requestedQty:         Number(row.requested_qty)          || 0,
    confirmedQty:         Number(row.confirmed_qty)          || 0,
    itemStatus:           row.item_status                    || 'pending',
    adminComment:         row.admin_comment                  || null,
    weightGrams:          row.weight_grams != null ? Number(row.weight_grams) : null,
  };
}

function toItem(i) {
  return {
    order_id:               i.orderId,
    product_id:             i.productId,
    product_title_snapshot: i.productTitleSnapshot,
    product_price_snapshot: i.productPriceSnapshot,
    requested_qty:          i.requestedQty,
    confirmed_qty:          0,
    item_status:            'pending',
    admin_comment:          null,
    weight_grams:           i.weightGrams ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the next sequential order number.
// Fetches the current maximum (nullslast so NULL values are ignored),
// then increments by 1. Returns 1 if no numbered orders exist yet.
async function getNextOrderNumber() {
  const rows = await sbFetch(
    `/${ORDERS_TBL}?select=order_number&order=order_number.desc.nullslast&limit=1`
  );
  if (!Array.isArray(rows) || !rows.length || rows[0].order_number == null) return 1;
  return Number(rows[0].order_number) + 1;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function createOrder(orderData) {
  const orderNumber = await getNextOrderNumber();
  const rows = await sbFetch(`/${ORDERS_TBL}`, {
    method:  'POST',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({ ...toOrder(orderData), order_number: orderNumber }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromOrder(row) : null;
}

export async function createOrderItem(itemData) {
  const rows = await sbFetch(`/${ITEMS_TBL}`, {
    method:  'POST',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(toItem(itemData)),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromItem(row) : null;
}

// Admin: all orders, newest first. Pass branchId to restrict to one branch.
export async function getOrders(branchId = null) {
  const filter = branchId
    ? `&branch_id=eq.${encodeURIComponent(branchId)}`
    : '';
  const rows = await sbFetch(`/${ORDERS_TBL}?order=created_at.desc${filter}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(fromOrder);
}

// Admin: single order by id
export async function getOrderById(id) {
  const rows = await sbFetch(`/${ORDERS_TBL}?id=eq.${encodeURIComponent(id)}`);
  if (!Array.isArray(rows) || !rows.length) return null;
  return fromOrder(rows[0]);
}

// Admin: items for one order
export async function getOrderItems(orderId) {
  const rows = await sbFetch(`/${ITEMS_TBL}?order_id=eq.${encodeURIComponent(orderId)}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(fromItem);
}

// User: orders by user_id; falls back to phone for guest/legacy orders with null user_id.
export async function getOrdersByUserId(userId, phone = null) {
  if (userId) {
    const rows = await sbFetch(
      `/${ORDERS_TBL}?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
    );
    if (Array.isArray(rows) && rows.length) return rows.map(fromOrder);
  }

  // Fallback: match by phone (covers orders placed as guest or before user_id was saved)
  if (phone) {
    const rows = await sbFetch(
      `/${ORDERS_TBL}?phone=eq.${encodeURIComponent(phone)}&order=created_at.desc`
    );
    if (Array.isArray(rows)) return rows.map(fromOrder);
  }

  return [];
}

// Admin: update confirmed_qty + item_status for one item
export async function updateOrderItem(itemId, { confirmedQty, itemStatus }) {
  const rows = await sbFetch(`/${ITEMS_TBL}?id=eq.${encodeURIComponent(itemId)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({ confirmed_qty: confirmedQty, item_status: itemStatus }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromItem(row) : null;
}

// Admin: write back recalculated total_confirmed_amount
export async function updateOrderConfirmedTotal(id, total) {
  const rows = await sbFetch(`/${ORDERS_TBL}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({ total_confirmed_amount: total, updated_at: new Date().toISOString() }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromOrder(row) : null;
}

// Admin: bulk-confirm all pending items for an order (called when order completes).
// Only updates item_status; confirmed_qty stays 0 — display layer shows requestedQty instead.
export async function confirmPendingItems(orderId) {
  await sbFetch(
    `/${ITEMS_TBL}?order_id=eq.${encodeURIComponent(orderId)}&item_status=eq.pending`,
    {
      method:  'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ item_status: 'confirmed' }),
    }
  );
}

// Admin: update order status (cancelReason only stored when status = 'cancelled')
export async function updateOrderStatus(id, status, cancelReason = null) {
  const payload = { status, updated_at: new Date().toISOString() };
  if (status === 'cancelled') payload.cancel_reason = cancelReason || null;
  const rows = await sbFetch(`/${ORDERS_TBL}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(payload),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromOrder(row) : null;
}
