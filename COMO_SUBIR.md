# Cómo subir DentFlow Pro

## Supabase
1. SQL Editor → ejecutar `supabase_migration.sql`
2. Storage → bucket `radiografias` (private)
3. Auth → Refresh token rotation ON
4. Deploy functions + secrets

## Vercel
1. Conectar repo `jfernandezdental-boop/dentflow-pro`
2. Root directory: .
3. Build: none (estático)
4. Output: .

O: `npx vercel --prod` con `index.html` + `vercel.json`.
