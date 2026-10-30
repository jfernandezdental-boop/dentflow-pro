-- DentFlow Pro · Aislamiento multi-tenant (RLS + RPC)
-- Ejecutar en Supabase → SQL Editor
-- Archivo completo también en artifacts locales del proyecto.

create extension if not exists "pgcrypto";

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

create or replace function public.tiene_rol(roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() = any(roles);
$$;

-- Columnas tenant (idempotente)
do $$ begin
  if exists (select 1 from information_schema.tables where table_name='pacientes') then
    alter table public.pacientes add column if not exists consultorio_id uuid;
  end if;
  if exists (select 1 from information_schema.tables where table_name='citas') then
    alter table public.citas add column if not exists consultorio_id uuid;
  end if;
  if exists (select 1 from information_schema.tables where table_name='presupuestos') then
    alter table public.presupuestos add column if not exists consultorio_id uuid;
  end if;
  if exists (select 1 from information_schema.tables where table_name='notificaciones') then
    alter table public.notificaciones add column if not exists consultorio_id uuid;
  end if;
end $$;

-- RLS ejemplo CITAS (repetir patrón en pacientes/presupuestos)
do $$ begin
  if exists (select 1 from information_schema.tables where table_name='citas') then
    alter table public.citas enable row level security;
    alter table public.citas force row level security;
    drop policy if exists "citas_select_tenant" on public.citas;
    drop policy if exists "citas_write_tenant" on public.citas;
    create policy "citas_select_tenant" on public.citas for select to authenticated
      using (public.es_super_admin() or consultorio_id = public.mi_consultorio_id());
    create policy "citas_write_tenant" on public.citas for all to authenticated
      using (public.es_super_admin() or consultorio_id = public.mi_consultorio_id())
      with check (public.es_super_admin() or consultorio_id = public.mi_consultorio_id());
  end if;
end $$;

-- RPC: contexto WhatsApp aislado por clinica
create or replace function public.rpc_paciente_por_telefono(p_telefono text, p_consultorio_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(p_telefono,''), '\D', '', 'g');
  v_tail text := right(v_digits, 9);
  v_row record;
  v_tenant uuid := p_consultorio_id;
begin
  if auth.uid() is not null and not public.es_super_admin() then
    v_tenant := coalesce(public.mi_consultorio_id(), v_tenant);
  end if;
  select p.* into v_row from public.pacientes p
  where (v_tenant is null or p.consultorio_id = v_tenant)
    and (
      regexp_replace(coalesce(p.telefono,''), '\D', '', 'g') = v_digits
      or right(regexp_replace(coalesce(p.telefono,''), '\D', '', 'g'), 9) = v_tail
    )
  order by p.created_at desc nulls last limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'paciente_no_encontrado');
  end if;
  return jsonb_build_object('ok', true, 'paciente', jsonb_build_object(
    'id', v_row.id, 'nombre', v_row.nombre, 'telefono', v_row.telefono,
    'consultorio_id', v_row.consultorio_id));
end;
$$;

create or replace function public.rpc_contexto_whatsapp(p_telefono text, p_consultorio_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pac jsonb; v_pid uuid; v_cid uuid; v_citas jsonb;
begin
  v_pac := public.rpc_paciente_por_telefono(p_telefono, p_consultorio_id);
  if (v_pac->>'ok')::boolean is not true then return v_pac; end if;
  v_pid := (v_pac->'paciente'->>'id')::uuid;
  v_cid := (v_pac->'paciente'->>'consultorio_id')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'fecha', coalesce(c.fecha::text, c.datekey::text),
    'hora', coalesce(c.hora, c.time), 'estado', c.estado, 'doctor', c.doctor
  )), '[]'::jsonb) into v_citas
  from public.citas c
  where c.paciente_id = v_pid and c.consultorio_id = v_cid
  limit 10;
  return jsonb_build_object(
    'ok', true, 'paciente', v_pac->'paciente', 'consultorio_id', v_cid,
    'citas_proximas', coalesce(v_citas, '[]'::jsonb), 'presupuestos', '[]'::jsonb);
end;
$$;

create or replace function public.rpc_confirmar_cita(p_cita_id uuid, p_consultorio_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_updated int;
begin
  update public.citas set estado = 'confirmada'
  where id = p_cita_id and consultorio_id = p_consultorio_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada_o_otro_tenant');
  end if;
  return jsonb_build_object('ok', true, 'action', 'confirmada');
end;
$$;

create or replace function public.rpc_cancelar_cita(p_cita_id uuid, p_consultorio_id uuid, p_motivo text default 'paciente_whatsapp')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_updated int;
begin
  update public.citas set estado = 'cancelada'
  where id = p_cita_id and consultorio_id = p_consultorio_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada_o_otro_tenant');
  end if;
  return jsonb_build_object('ok', true, 'action', 'cancelada');
end;
$$;

create or replace function public.rpc_reagendar_cita(
  p_cita_id uuid, p_consultorio_id uuid, p_fecha date default null, p_franja text default 'indistinto'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_updated int;
begin
  update public.citas set estado = 'pendiente',
    fecha = coalesce(p_fecha, fecha)
  where id = p_cita_id and consultorio_id = p_consultorio_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada_o_otro_tenant');
  end if;
  return jsonb_build_object('ok', true, 'action', 'reagendada', 'fecha', p_fecha);
end;
$$;

create or replace function public.rpc_ejecutar_intent_whatsapp(p_intent jsonb, p_consultorio_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_type text := p_intent->>'intent'; v_cita uuid;
begin
  if p_consultorio_id is null then
    return jsonb_build_object('ok', false, 'error', 'consultorio_requerido');
  end if;
  if v_type is null or v_type = 'ninguna' then
    return jsonb_build_object('ok', true, 'action', 'none');
  end if;
  begin v_cita := nullif(p_intent->>'cita_id','')::uuid; exception when others then v_cita := null; end;
  if v_type = 'confirmar_cita' then
    return public.rpc_confirmar_cita(v_cita, p_consultorio_id);
  elsif v_type = 'cancelar_cita' then
    return public.rpc_cancelar_cita(v_cita, p_consultorio_id, p_intent->>'motivo');
  elsif v_type = 'reagendar_cita' then
    return public.rpc_reagendar_cita(v_cita, p_consultorio_id,
      nullif(p_intent->>'fecha_preferida','')::date, coalesce(p_intent->>'franja','indistinto'));
  else
    return jsonb_build_object('ok', false, 'error', 'intent_desconocido');
  end if;
end;
$$;

grant execute on function public.rpc_paciente_por_telefono(text, uuid) to authenticated, service_role;
grant execute on function public.rpc_contexto_whatsapp(text, uuid) to authenticated, service_role;
grant execute on function public.rpc_confirmar_cita(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_cancelar_cita(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.rpc_reagendar_cita(uuid, uuid, date, text) to authenticated, service_role;
grant execute on function public.rpc_ejecutar_intent_whatsapp(jsonb, uuid) to authenticated, service_role;

-- Ver TENANT_RLS_RPC.md y el archivo local completo rls_tenant_aislamiento.sql
-- para políticas FORCE en todas las tablas y storage.
