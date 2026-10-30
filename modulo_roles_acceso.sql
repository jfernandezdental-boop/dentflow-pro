-- DentFlow · Roles y acceso
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  consultorio_id uuid,
  nombre text,
  email text,
  rol text not null default 'personal'
    check (rol in ('super_admin','admin','doctor','recepcionista','personal','paciente')),
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  rol text not null,
  modulo text not null,
  puede_ver boolean default false,
  puede_editar boolean default false,
  primary key (rol, modulo)
);

insert into public.role_permissions (rol, modulo, puede_ver, puede_editar) values
  ('super_admin','admin_global', true, true),
  ('super_admin','clinicas', true, true),
  ('super_admin','usuarios', true, true),
  ('admin','agenda', true, true),
  ('admin','pacientes', true, true),
  ('admin','usuarios_clinica', true, true),
  ('admin','config_clinica', true, true),
  ('doctor','agenda', true, true),
  ('doctor','clinico', true, true),
  ('doctor','recetas', true, true),
  ('recepcionista','agenda', true, true),
  ('recepcionista','pacientes', true, true)
on conflict (rol, modulo) do nothing;

create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'rol', ''),
    (select rol from public.profiles where id = auth.uid() limit 1),
    'personal'
  );
$$;

create or replace function public.mi_consultorio_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'consultorio_id', '')::uuid,
    (select consultorio_id from public.profiles where id = auth.uid() limit 1)
  );
$$;

create or replace function public.es_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() = 'super_admin';
$$;

create or replace function public.rpc_mi_sesion()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'no_auth'); end if;
  select * into v from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('ok', true, 'rol', public.mi_rol(), 'consultorio_id', public.mi_consultorio_id(), 'activo', true);
  end if;
  if v.activo is false then return jsonb_build_object('ok', false, 'error', 'cuenta_desactivada'); end if;
  return jsonb_build_object('ok', true, 'id', v.id, 'nombre', v.nombre, 'email', v.email,
    'rol', v.rol, 'consultorio_id', v.consultorio_id, 'activo', v.activo);
end;
$$;

create or replace function public.rpc_asignar_rol(p_user_id uuid, p_rol text, p_consultorio_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_my_rol text := public.mi_rol(); v_my_cid uuid := public.mi_consultorio_id(); v_target uuid := coalesce(p_consultorio_id, v_my_cid);
begin
  if p_rol not in ('super_admin','admin','doctor','recepcionista','personal','paciente') then
    return jsonb_build_object('ok', false, 'error', 'rol_invalido');
  end if;
  if p_rol = 'super_admin' and v_my_rol is distinct from 'super_admin' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_my_rol = 'admin' then
    if p_consultorio_id is not null and p_consultorio_id is distinct from v_my_cid then
      return jsonb_build_object('ok', false, 'error', 'otro_tenant');
    end if;
    v_target := v_my_cid;
  elsif v_my_rol is distinct from 'super_admin' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  insert into public.profiles (id, rol, consultorio_id, updated_at)
  values (p_user_id, p_rol, case when p_rol = 'super_admin' then null else v_target end, now())
  on conflict (id) do update set rol = excluded.rol, consultorio_id = excluded.consultorio_id, updated_at = now();
  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'rol', p_rol);
end;
$$;

create or replace function public.rpc_listar_usuarios()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.mi_rol() = 'super_admin' then
    return jsonb_build_object('ok', true, 'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', p.email, 'rol', p.rol, 'consultorio_id', p.consultorio_id, 'activo', p.activo))
      from public.profiles p), '[]'::jsonb));
  elsif public.mi_rol() = 'admin' then
    return jsonb_build_object('ok', true, 'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', p.email, 'rol', p.rol, 'consultorio_id', p.consultorio_id, 'activo', p.activo))
      from public.profiles p where p.consultorio_id = public.mi_consultorio_id()), '[]'::jsonb));
  else
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.es_super_admin() or consultorio_id = public.mi_consultorio_id());

grant execute on function public.mi_rol() to authenticated;
grant execute on function public.mi_consultorio_id() to authenticated;
grant execute on function public.rpc_mi_sesion() to authenticated;
grant execute on function public.rpc_asignar_rol(uuid, text, uuid) to authenticated;
grant execute on function public.rpc_listar_usuarios() to authenticated;
