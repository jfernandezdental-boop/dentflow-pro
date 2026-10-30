-- Proforma → cargo contable
alter table public.presupuestos add column if not exists estado text default 'borrador';
alter table public.presupuestos add column if not exists tipo text default 'proforma';
alter table public.presupuestos add column if not exists cargo_id uuid;
alter table public.presupuestos add column if not exists total numeric default 0;
alter table public.presupuestos add column if not exists consultorio_id uuid;
alter table public.presupuestos add column if not exists paciente_id uuid;

create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  consultorio_id uuid,
  paciente_id uuid,
  proforma_id uuid,
  concepto text,
  total numeric not null default 0,
  pagado numeric not null default 0,
  fecha date default current_date,
  estado text default 'pendiente',
  origen text default 'factura_desde_proforma',
  created_at timestamptz default now()
);

create or replace function public.rpc_facturar_proforma(p_presupuesto_id uuid, p_consultorio_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pr record; v_cargo_id uuid := gen_random_uuid();
begin
  select * into v_pr from public.presupuestos where id = p_presupuesto_id and consultorio_id = p_consultorio_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'proforma_no_encontrada'); end if;
  if v_pr.estado = 'anulado' then return jsonb_build_object('ok', false, 'error', 'anulada'); end if;
  insert into public.cargos (id, consultorio_id, paciente_id, proforma_id, concepto, total, pagado, fecha, estado, origen)
  values (v_cargo_id, p_consultorio_id, v_pr.paciente_id, p_presupuesto_id, 'Tratamiento dental', coalesce(v_pr.total,0), 0, current_date, 'pendiente', 'factura_desde_proforma');
  update public.presupuestos set estado = 'facturado', tipo = 'factura', cargo_id = v_cargo_id where id = p_presupuesto_id;
  return jsonb_build_object('ok', true, 'cargo_id', v_cargo_id, 'total', coalesce(v_pr.total,0));
end;
$$;
grant execute on function public.rpc_facturar_proforma(uuid, uuid) to authenticated, service_role;
