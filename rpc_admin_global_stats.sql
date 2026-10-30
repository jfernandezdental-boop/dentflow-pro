-- Estadisticas Admin Global (super_admin)
create or replace function public.rpc_admin_global_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.mi_rol();
  v_clinicas jsonb;
  v_tot_doc int := 0; v_tot_staff int := 0; v_tot_pac int := 0; v_tot_citas int := 0;
begin
  if auth.uid() is not null and v_rol is distinct from 'super_admin' and auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'solo_super_admin');
  end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_clinicas from (
    select jsonb_build_object(
      'id', c.id, 'nombre', c.nombre, 'slug', c.slug, 'plan', c.plan,
      'activo', coalesce(c.activo, true), 'email', c.email, 'telefono', c.telefono,
      'doctores', (select count(*) from public.profiles p where p.consultorio_id = c.id and p.rol = 'doctor'),
      'staff', (select count(*) from public.profiles p where p.consultorio_id = c.id and p.rol in ('admin','recepcionista','personal')),
      'pacientes', (select count(*) from public.pacientes pa where pa.consultorio_id = c.id),
      'citas30', (select count(*) from public.citas ci where ci.consultorio_id = c.id
                 and coalesce(ci.fecha, ci.created_at::date) >= current_date - 30)
    ) as x from public.consultorios c order by c.nombre
  ) s;
  select coalesce(sum((x->>'doctores')::int),0), coalesce(sum((x->>'staff')::int),0),
         coalesce(sum((x->>'pacientes')::int),0), coalesce(sum((x->>'citas30')::int),0)
  into v_tot_doc, v_tot_staff, v_tot_pac, v_tot_citas from jsonb_array_elements(v_clinicas) x;
  return jsonb_build_object('ok', true, 'clinicas', v_clinicas, 'totales',
    jsonb_build_object('clinicas', jsonb_array_length(v_clinicas), 'doctores', v_tot_doc,
      'staff', v_tot_staff, 'pacientes', v_tot_pac, 'citas30', v_tot_citas));
exception when undefined_table then
  return jsonb_build_object('ok', false, 'error', 'faltan_tablas');
end;
$$;
grant execute on function public.rpc_admin_global_stats() to authenticated, service_role;
