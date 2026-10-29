# index.html (app principal)

El frontend completo (`index.html` / `dentflow-pro.html`) pesa ~700 KB y puede subirse así:

```bash
git clone https://github.com/jfernandezdental-boop/dentflow-pro.git
cd dentflow-pro
# Copiar index.html desde el paquete local de artifacts
cp /ruta/a/index.html .
git add index.html
git commit -m "feat: app frontend DentFlow Pro"
git push
```

Luego en Vercel: Import repo → Deploy.

O arrastra `index.html` + `vercel.json` en Vercel Dashboard.
