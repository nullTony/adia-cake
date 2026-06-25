-- MED-6: Restrict staff_users access via anon key
-- Run in Supabase Dashboard → SQL Editor
-- Prevents unauthenticated enumeration of all staff (roles, phones, telegram IDs).
--
-- WARNING: The current login flow reads staff rows via anon key.
-- This migration creates an RPC that handles login without exposing the full table.
-- After running this migration, deploy the new login flow (RPC-based).
-- Until then, run only step 1 to limit column exposure.

-- ── Step 1: Enable RLS (if not already) ───────────────────────────────────

ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;

-- ── Step 2: Create SECURITY DEFINER RPC for password verification ──────────
-- This RPC lets frontend verify a password WITHOUT receiving the hash/password.
-- Returns only the fields needed for the session (no password column).

CREATE OR REPLACE FUNCTION verify_staff_login(p_phone text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r staff_users%ROWTYPE;
BEGIN
  SELECT * INTO r
  FROM staff_users
  WHERE phone = p_phone AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  -- Plain-text comparison for now. Replace with crypt() after bcrypt migration.
  IF r.password IS NULL OR r.password <> p_password THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'wrong_password');
  END IF;

  RETURN jsonb_build_object(
    'valid',             true,
    'id',                r.id,
    'full_name',         r.full_name,
    'phone',             r.phone,
    'role',              r.role,
    'branch_id',         r.branch_id,
    'extra_permissions', r.extra_permissions,
    'telegram_chat_id',  r.telegram_chat_id,
    'is_active',         r.is_active
  );
END;
$$;

-- ── Step 3: RLS policies on staff_users ───────────────────────────────────

-- Deny all direct anon SELECT (login now uses RPC above)
DROP POLICY IF EXISTS "staff_users_no_anon_select" ON staff_users;
CREATE POLICY "staff_users_no_anon_select" ON staff_users
  FOR SELECT
  USING (false);

-- Allow service_role full access (bypasses RLS — for admin operations and bot.js)
-- No policy needed: service_role always bypasses RLS in Supabase.

-- ── After running this migration ──────────────────────────────────────────
-- 1. Update js/api/staff-api.js: replace sbFetch('/staff_users?phone=eq...')
--    with sbFetch('/rpc/verify_staff_login', { method: 'POST', body: { p_phone, p_password } })
-- 2. The function returns { valid, id, full_name, role, ... } — use directly.
-- 3. Remove password from all SELECT queries in staff-api.js.
