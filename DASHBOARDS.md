# Dashboards profesionales DentFlow

## Archivos
| Archivo | Rol |
|---------|-----|
| `dashboard-doctor.html` | Dashboard del **doctor**: agenda hoy, pacientes, clinico, recetas, imagenes, IA Grok, rendimiento |
| `dashboard-admin-global.html` | **Super admin multi-tenant**: clinicas, alta tenant+admin, usuarios/roles, stats, secretos API, bots IA |
| `rpc_admin_global_stats.sql` | RPC agregada solo `super_admin` |

## Admin global
- Resumen: clinicas, activas, doctores, administrativos, pacientes, citas 30d
- CRUD tenants (activar/desactivar, plan, contacto)
- Crear clinica + admin inicial (+ seed doctores/recepcion)
- Usuarios y roles (super_admin, admin, doctor, recepcionista)
- Stats por clinica
- Checklist claves (Grok, SendGrid, WhatsApp) en Supabase Secrets
- Bots IA ON/OFF por clinica

## Doctor
- KPIs del dia, timeline, accesos clinicos, asistente IA, rendimiento

## Deploy
SQL: `rpc_admin_global_stats.sql`
Vercel: incluir HTML en el repo estatico
Repo: https://github.com/jfernandezdental-boop/dentflow-pro
