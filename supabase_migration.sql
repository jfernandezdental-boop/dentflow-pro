-- DentFlow Pro — migración base (roles JWT + helpers multi-tenant)
-- Ejecutar en Supabase → SQL Editor

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

alter table public.profiles enable row level security;

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

create or replace function public.tiene_rol(roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() = any(roles);
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
using (
  id = auth.uid()
  or consultorio_id = public.mi_consultorio_id()
  or public.mi_rol() = 'super_admin'
);

-- Imágenes clínicas (metadatos)
create table if not exists public.imagenes_clinicas (
  id uuid primary key default gen_random_uuid(),
  consultorio_id uuid not null,
  paciente_id uuid not null,
  tipo text,
  titulo text,
  storage_path text not null,
  bucket text default 'radiografias',
  created_at timestamptz default now()
);
alter table public.imagenes_clinicas enable row level security;
drop policy if exists "img_tenant" on public.imagenes_clinicas;
create policy "img_tenant" on public.imagenes_clinicas for all to authenticated
using (consultorio_id = public.mi_consultorio_id())
with check (consultorio_id = public.mi_consultorio_id());

-- Nota: políticas storage.objects y tablas citas/pacientes/presupuestos
-- deben existir en el proyecto; ver rls_roles_jwt.sql y rls_imagenes_clinicas.sql completos en historial.
