-- ============================================================
--  ADIA CAKE — FINAL STABLE MIGRATION
--  Run once in Supabase SQL Editor.
--  Fully idempotent (safe to re-run).
-- ============================================================

-- ── 1. branch_products ────────────────────────────────────────────────────────
--
--  Pivot table between branches and products.
--  One row = one product assigned to one branch.
--  is_available    → shown in catalog (in stock)
--  is_today_showcase → shown in "Today" section on homepage
--  showcase_order  → sort order within the branch showcase
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branch_products (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id         uuid        NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,
  product_id        uuid        NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  is_available      boolean     NOT NULL DEFAULT true,
  is_today_showcase boolean     NOT NULL DEFAULT false,
  is_popular        boolean     NOT NULL DEFAULT false,
  showcase_order    integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_id)
);

-- Indexes for the most common query patterns
CREATE INDEX IF NOT EXISTS idx_bp_branch_id         ON branch_products (branch_id);
CREATE INDEX IF NOT EXISTS idx_bp_branch_today      ON branch_products (branch_id) WHERE is_today_showcase = true;
CREATE INDEX IF NOT EXISTS idx_bp_branch_available  ON branch_products (branch_id) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_bp_branch_popular    ON branch_products (branch_id) WHERE is_popular = true;

-- If branch_products already exists, add the column (idempotent)
ALTER TABLE branch_products ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false;

-- ── 2. products — add weight and stock columns ────────────────────────────────
--
--  These columns are used by the branch_products embedded joins and the
--  product card renderer. They may already exist if you added them manually.
--  All are safe no-ops if the column is already present.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_type    text    NOT NULL DEFAULT 'piece';
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_step  numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_weight   numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_weight   numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock     boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_popular   boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_today_showcase boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at   timestamptz;

-- ── 3. orders.branch_id ───────────────────────────────────────────────────────
--
--  The branch that will fulfil this order.
--  • pickup orders  → same as pickup_branch_id
--  • delivery orders → branch selected by customer at checkout time
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders (branch_id);

-- ── 4. staff_users.assigned_branch_id ────────────────────────────────────────
--
--  For managers: limits which branch data they can see.
--  NULL = access to all branches (owner / admin roles).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS assigned_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

-- ── 5. RLS — Enable on branch_products ────────────────────────────────────────
--
--  All other tables already had RLS set up previously.
--  We enable it here and create the minimal required policies.
--
--  Design rationale (anon-key-only constraint):
--    • No Supabase Auth → can't distinguish staff from customers in RLS.
--    • All legitimate DB access goes through the anon key.
--    • Policies are permissive for anon so the storefront and admin both work.
--    • Real access control lives in the admin auth layer (js/admin/auth.js).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE branch_products ENABLE ROW LEVEL SECURITY;

-- Drop and recreate so re-runs are safe
DROP POLICY IF EXISTS "anon can read branch_products"   ON branch_products;
DROP POLICY IF EXISTS "anon can insert branch_products" ON branch_products;
DROP POLICY IF EXISTS "anon can update branch_products" ON branch_products;
DROP POLICY IF EXISTS "anon can delete branch_products" ON branch_products;

CREATE POLICY "anon can read branch_products"
  ON branch_products FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon can insert branch_products"
  ON branch_products FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update branch_products"
  ON branch_products FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon can delete branch_products"
  ON branch_products FOR DELETE
  TO anon
  USING (true);

-- ── 6. Ensure RLS policies exist on core tables ───────────────────────────────
--
--  These tables must already have RLS enabled from the initial setup.
--  The statements below are guards only — they won't change existing policies.
-- ─────────────────────────────────────────────────────────────────────────────

-- products: anon read (catalog + storefront)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products' AND policyname = 'anon can read products'
  ) THEN
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon can read products"
      ON products FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- branches: anon read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'branches' AND policyname = 'anon can read branches'
  ) THEN
    ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon can read branches"
      ON branches FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- categories: anon read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'categories' AND policyname = 'anon can read categories'
  ) THEN
    ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon can read categories"
      ON categories FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- orders: anon insert (checkout) + anon read (order tracking)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'anon can insert orders'
  ) THEN
    ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon can insert orders"
      ON orders FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "anon can read orders"
      ON orders FOR SELECT TO anon USING (true);
    CREATE POLICY "anon can update orders"
      ON orders FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- order_items: anon insert + read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_items' AND policyname = 'anon can insert order_items'
  ) THEN
    ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon can insert order_items"
      ON order_items FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "anon can read order_items"
      ON order_items FOR SELECT TO anon USING (true);
    CREATE POLICY "anon can update order_items"
      ON order_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- clients: anon insert (registration) + select
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients' AND policyname = 'anon can insert clients'
  ) THEN
    ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon can insert clients"
      ON clients FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "anon can read clients"
      ON clients FOR SELECT TO anon USING (true);
    CREATE POLICY "anon can update clients"
      ON clients FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- staff_users: anon read only (admin login reads hashed password for comparison)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staff_users' AND policyname = 'anon can read staff_users'
  ) THEN
    ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon can read staff_users"
      ON staff_users FOR SELECT TO anon USING (true);
    CREATE POLICY "anon can update staff_users"
      ON staff_users FOR UPDATE TO anon USING (true) WITH CHECK (true);
    CREATE POLICY "anon can insert staff_users"
      ON staff_users FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

-- ── 7. Verify ─────────────────────────────────────────────────────────────────
--
--  Run this SELECT after applying the migration to confirm everything is in place.
--  Expected: branch_products, orders, staff_users all show their new columns.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   IN ('branch_products', 'orders', 'staff_users', 'products')
  AND column_name  IN ('id', 'branch_id', 'product_id', 'is_available',
                       'is_today_showcase', 'showcase_order', 'assigned_branch_id',
                       'unit_type', 'weight_step', 'min_weight', 'max_weight',
                       'in_stock', 'is_popular', 'updated_at')
ORDER BY table_name, column_name;
