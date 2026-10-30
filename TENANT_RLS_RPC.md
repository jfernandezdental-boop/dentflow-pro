# Aislamiento multi-tenant (clinicas)

## Ejecutar en Supabase SQL Editor
`rls_tenant_aislamiento.sql`

## Que hace
- `mi_rol()` / `mi_consultorio_id()` desde JWT app_metadata
- RLS FORCE en pacientes, citas, presupuestos, notificaciones, doctores, imagenes
- RPC seguras:
  - `rpc_contexto_whatsapp(telefono, consultorio_id)`
  - `rpc_confirmar_cita` / `rpc_cancelar_cita` / `rpc_reagendar_cita`
  - `rpc_ejecutar_intent_whatsapp(intent, consultorio_id)`

## Edge Function
`whatsapp-grok-webhook` usa solo esas RPC (no UPDATE sin tenant).

Secret opcional por numero de clinica:
```
DEFAULT_CONSULTORIO_ID=<uuid-consultorio>
```

## Flujo
1. SQL Editor → pegar `rls_tenant_aislamiento.sql`
2. `supabase functions deploy whatsapp-grok-webhook --no-verify-jwt`
3. Cada clinica: mismo bot con `DEFAULT_CONSULTORIO_ID` o un function deploy por clinica
