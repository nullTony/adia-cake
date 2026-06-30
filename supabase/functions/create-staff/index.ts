// Supabase Edge Function — create-staff
// Creates or updates a staff member in Supabase Auth + staff_users.
//
// Security model:
//   • Caller JWT must resolve to role = 'super_admin' via current_staff_role RPC.
//   • Privileged Auth admin operations use the service-role client only.
//   • On DB insert failure the Auth user is deleted (rollback) to prevent orphans.
//
// Behaviour:
//   • Existing Auth user (email found): optionally update password if ≥4 chars;
//     UPSERT staff_users row (by auth_user_id).
//   • New Auth user (email not found): password required (≥4 chars); create
//     Auth user + INSERT staff_users with rollback on failure.
//
// Deploy:
//   supabase functions deploy create-staff
//
// Endpoint: https://orfxopppqqvwueoatasu.supabase.co/functions/v1/create-staff

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  // ── CORS preflight ────────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  // ── Env vars (injected automatically by Supabase Edge runtime) ────────────────
  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // ── Verify caller is super_admin via their own JWT ───────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Missing Authorization header' }, 401);
  }

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: roleData, error: roleErr } = await callerClient.rpc('current_staff_role');
  if (roleErr) {
    console.error('[create-staff] current_staff_role error:', roleErr.message);
    return json({ ok: false, error: 'Ошибка проверки роли' }, 500);
  }
  if ((roleData as string | null) !== 'super_admin') {
    console.warn('[create-staff] Forbidden: caller role =', roleData);
    return json({ ok: false, error: 'Forbidden' }, 403);
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
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

  if (!full_name || !phone || !role || !email) {
    return json({ ok: false, error: 'full_name, phone, role, email — обязательные поля' }, 400);
  }

  const trimmedPwd  = (password ?? '').trim();
  const hasPassword = trimmedPwd.length >= 4;

  // ── Service-role client for privileged operations ─────────────────────────────
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Check if Auth user with this email already exists ────────────────────────
  // listUsers filter narrows the server-side search; exact match is verified below.
  const { data: listData, error: listErr } = await svc.auth.admin.listUsers({
    filter:  email,
    perPage: 10,
  });

  if (listErr) {
    console.error('[create-staff] listUsers error:', listErr.message);
    return json({ ok: false, error: 'Ошибка поиска пользователя: ' + listErr.message }, 500);
  }

  const existingAuthUser = listData?.users?.find(u => u.email === email) ?? null;

  // ── Path A: existing Auth user ────────────────────────────────────────────────
  if (existingAuthUser) {
    // Optionally update password (only if caller supplied one that is ≥4 chars)
    if (hasPassword) {
      const { error: pwdErr } = await svc.auth.admin.updateUserById(
        existingAuthUser.id,
        { password: trimmedPwd },
      );
      if (pwdErr) {
        console.error('[create-staff] updateUserById error:', pwdErr.message);
        return json({ ok: false, error: 'Ошибка смены пароля: ' + pwdErr.message }, 500);
      }
    }

    // UPSERT staff_users — creates the row if missing, updates if already there
    const { data: staff, error: upsertErr } = await svc
      .from('staff_users')
      .upsert(
        {
          full_name,
          phone,
          role,
          branch_id:    branch_id || null,
          is_active:    true,
          auth_user_id: existingAuthUser.id,
        },
        { onConflict: 'auth_user_id' },
      )
      .select()
      .single();

    if (upsertErr) {
      console.error('[create-staff] upsert error:', upsertErr.message);
      return json({ ok: false, error: 'Ошибка обновления записи: ' + upsertErr.message }, 500);
    }

    console.log('[create-staff] Existing Auth user updated. staff_users id:', staff?.id);
    return json({ ok: true, staff, created: false });
  }

  // ── Path B: new Auth user — password required ─────────────────────────────────
  if (!hasPassword) {
    return json(
      { ok: false, error: 'Для нового сотрудника нужен пароль (минимум 4 символа)' },
      400,
    );
  }

  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email,
    password: trimmedPwd,
    email_confirm: true,
  });

  if (authErr) {
    console.error('[create-staff] createUser error:', authErr.message);
    return json({ ok: false, error: 'Ошибка создания пользователя: ' + authErr.message }, 500);
  }

  const newUser = authData.user;
  if (!newUser?.id) {
    return json({ ok: false, error: 'Не удалось создать пользователя' }, 500);
  }

  // INSERT staff_users; rollback Auth user on failure to prevent orphaned accounts
  const { data: staff, error: insErr } = await svc
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
    console.error('[create-staff] insert error — rolling back Auth user:', insErr.message);
    await svc.auth.admin.deleteUser(newUser.id);
    return json({ ok: false, error: 'Ошибка записи сотрудника: ' + insErr.message }, 500);
  }

  console.log('[create-staff] New staff created. id:', staff?.id, '| auth_user_id:', newUser.id);
  return json({ ok: true, staff, created: true });
});
