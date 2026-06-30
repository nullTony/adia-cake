// Supabase Edge Function — create-staff
// Creates a Supabase Auth user + staff_users row in a single atomic operation.
//
// Security model:
//   • Caller must hold a valid staff JWT with role = 'super_admin' (verified via
//     current_staff_role RPC using the caller's own token — no trust on the wire).
//   • A service-role client is used only for the privileged Auth admin and INSERT
//     operations; the caller's role check always uses the anon client + caller JWT.
//   • On DB insert failure the newly created Auth user is deleted (rollback) to
//     prevent orphaned Auth accounts that can never be accessed.
//
// Deploy:
//   supabase functions deploy create-staff
//
// Endpoint: https://orfxopppqqvwueoatasu.supabase.co/functions/v1/create-staff

import { serve }         from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient }  from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  // ── Read env vars (automatically injected by Supabase runtime) ──────────────
  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // ── Verify caller role via their own JWT ────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Missing Authorization header' }, 401);
  }

  // Use the caller's JWT — if they're not super_admin the RPC returns null/other role
  const adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: roleData, error: roleErr } = await adminClient.rpc('current_staff_role');
  if (roleErr) {
    console.error('[create-staff] current_staff_role RPC error:', roleErr.message);
    return json({ ok: false, error: 'Ошибка проверки роли' }, 500);
  }

  const callerRole = roleData as string | null;
  if (callerRole !== 'super_admin') {
    console.warn('[create-staff] Forbidden: caller role =', callerRole);
    return json({ ok: false, error: 'Forbidden' }, 403);
  }

  // ── Parse + validate body ───────────────────────────────────────────────────
  let body: {
    full_name?: string;
    phone?:     string;
    role?:      string;
    branch_id?: string | null;
    email?:     string;
    password?:  string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { full_name, phone, role, branch_id, email, password } = body;

  if (!full_name || !phone || !role || !email || !password) {
    return json({ ok: false, error: 'full_name, phone, role, email, password — все поля обязательны' }, 400);
  }

  // ── Service-role client for privileged operations ───────────────────────────
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Create Supabase Auth user ───────────────────────────────────────────────
  const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr) {
    const msg = authErr.message?.toLowerCase() ?? '';
    // Detect duplicate email (Supabase may return 'already registered', 'email_exists', etc.)
    const isDuplicate =
      msg.includes('already') ||
      msg.includes('registered') ||
      (authErr as { code?: string }).code === 'email_exists';

    if (isDuplicate) {
      return json({ ok: false, error: 'Пользователь с таким email уже существует' }, 409);
    }
    console.error('[create-staff] auth.admin.createUser error:', authErr.message);
    return json({ ok: false, error: 'Ошибка создания пользователя: ' + authErr.message }, 500);
  }

  const newUser = authData.user;
  if (!newUser?.id) {
    return json({ ok: false, error: 'Не удалось создать пользователя' }, 500);
  }

  // ── Insert staff_users row ──────────────────────────────────────────────────
  const { data: staff, error: insErr } = await serviceClient
    .from('staff_users')
    .insert({
      full_name,
      phone,
      role,
      branch_id:    branch_id || null,
      is_active:    true,
      auth_user_id: newUser.id,
    })
    .select()
    .single();

  if (insErr) {
    // Rollback: delete the Auth user to prevent orphaned accounts
    console.error('[create-staff] staff_users insert error — rolling back auth user:', insErr.message);
    await serviceClient.auth.admin.deleteUser(newUser.id);
    return json({ ok: false, error: 'Ошибка записи сотрудника: ' + insErr.message }, 500);
  }

  console.log('[create-staff] Staff created successfully:', staff?.id, '| auth_user_id:', newUser.id);
  return json({ ok: true, staff });
});
