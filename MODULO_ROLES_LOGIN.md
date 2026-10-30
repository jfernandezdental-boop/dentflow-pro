# Modulo roles + Login profesional

## Archivos
| Archivo | Uso |
|---------|-----|
| `login.html` | UI/UX Pro de acceso |
| `modulo_roles_acceso.sql` | profiles, permisos, RLS, RPC |
| `dashboard-admin-global.html` | Destino super_admin |
| `dashboard-doctor.html` | Destino doctor |

## Roles
- super_admin: todas las clinicas
- admin: solo su consultorio_id
- doctor / recepcionista / personal / paciente

## Seguridad
Auth Supabase + JWT app_metadata (rol, consultorio_id) + RLS + RPC:
- rpc_mi_sesion
- rpc_asignar_rol
- rpc_set_usuario_activo
- rpc_listar_usuarios

## Redirect
super_admin → dashboard-admin-global.html
doctor → dashboard-doctor.html
admin/resto → index.html
