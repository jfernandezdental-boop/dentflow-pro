-- Bot: disponibilidad + crear cita + crear proforma + intents
-- Ver archivo local completo en artifacts; funciones clave:

create or replace function public.rpc_disponibilidad_doctor(
  p_consultorio_id uuid, p_doctor text default null, p_dias int default 7, p_duracion_min int default 30
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slots jsonb := '[]'::jsonb; v_day date; v_i int; v_h time; v_ocupado boolean; v_count int := 0;
begin
  if p_consultorio_id is null then
    return jsonb_build_object('ok', false, 'error', 'consultorio_requerido');
  end if;
  for v_i in 1..greatest(p_dias,1) loop
    v_day := (current_date + v_i);
    if extract(dow from v_day)::int = 0 then continue; end if;
    for v_h in
      select t::time from generate_series('09:00'::time,'12:30'::time,(p_duracion_min||' minutes')::interval) t
      union all
      select t::time from generate_series('15:00'::time,'17:30'::time,(p_duracion_min||' minutes')::interval) t
    loop
      select exists (
        select 1 from public.citas c
        where c.consultorio_id = p_consultorio_id
          and coalesce(c.fecha::text, c.datekey) = v_day::text
          and coalesce(c.hora, c.time, '') like left(v_h::text,5)||'%'
          and coalesce(c.estado,'') not in ('cancelada','no_asistio')
          and (p_doctor is null or p_doctor = '' or c.doctor ilike '%'||p_doctor||'%')
      ) into v_ocupado;
      if not v_ocupado then
        v_slots := v_slots || jsonb_build_array(jsonb_build_object(
          'fecha', v_day::text, 'hora', to_char(v_h,'HH24:MI'), 'doctor', nullif(p_doctor,'')));
        v_count := v_count + 1;
        exit when v_count >= 24;
      end if;
    end loop;
    exit when v_count >= 24;
  end loop;
  return jsonb_build_object('ok', true, 'slots', v_slots, 'total', v_count);
end;
$$;

create or replace function public.rpc_crear_cita(
  p_consultorio_id uuid, p_paciente_id uuid, p_fecha date, p_hora text,
  p_doctor text default null, p_motivo text default 'Consulta', p_duracion_min int default 30
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ocupado boolean; v_id uuid := gen_random_uuid(); v_pac record;
begin
  select * into v_pac from public.pacientes where id=p_paciente_id and consultorio_id=p_consultorio_id;
  if not found then return jsonb_build_object('ok',false,'error','paciente_otro_tenant'); end if;
  select exists (
    select 1 from public.citas c where c.consultorio_id=p_consultorio_id
      and coalesce(c.fecha::text,c.datekey)=p_fecha::text
      and coalesce(c.hora,c.time,'') like left(p_hora,5)||'%'
      and coalesce(c.estado,'') not in ('cancelada','no_asistio')
  ) into v_ocupado;
  if v_ocupado then return jsonb_build_object('ok',false,'error','horario_ocupado'); end if;
  insert into public.citas (id, consultorio_id, paciente_id, fecha, datekey, hora, time, doctor, motivo, estado)
  values (v_id, p_consultorio_id, p_paciente_id, p_fecha, p_fecha::text, left(p_hora,5), left(p_hora,5), p_doctor, p_motivo, 'pendiente');
  return jsonb_build_object('ok',true,'action','cita_creada','cita_id',v_id,'fecha',p_fecha,'hora',left(p_hora,5));
exception when others then
  return jsonb_build_object('ok',false,'error',SQLERRM);
end;
$$;

create or replace function public.rpc_crear_proforma(
  p_consultorio_id uuid, p_paciente_id uuid, p_items jsonb default '[]'::jsonb,
  p_total numeric default null, p_notas text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_total numeric := coalesce(p_total,0); v_pac record;
begin
  select * into v_pac from public.pacientes where id=p_paciente_id and consultorio_id=p_consultorio_id;
  if not found then return jsonb_build_object('ok',false,'error','paciente_otro_tenant'); end if;
  insert into public.presupuestos (id, consultorio_id, paciente_id, estado, total, items, notas, created_at)
  values (v_id, p_consultorio_id, p_paciente_id, 'proforma', v_total, coalesce(p_items,'[]'::jsonb), p_notas, now());
  return jsonb_build_object('ok',true,'action','proforma_creada','presupuesto_id',v_id,'total',v_total);
exception when others then
  return jsonb_build_object('ok',false,'error',SQLERRM);
end;
$$;

grant execute on function public.rpc_disponibilidad_doctor(uuid,text,int,int) to authenticated, service_role;
grant execute on function public.rpc_crear_cita(uuid,uuid,date,text,text,text,int) to authenticated, service_role;
grant execute on function public.rpc_crear_proforma(uuid,uuid,jsonb,numeric,text) to authenticated, service_role;
