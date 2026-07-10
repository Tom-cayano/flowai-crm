# Restaurar el asistente de Instagram (`instagram_assistant_v1`) — < 5 minutos

## Vía A — desde el tag de git (recomendada)

```bash
git checkout instagram_assistant_v1 -- lib/instagram tests/instagram pages/api/webhook/instagram.ts

npm run test:ig            # unit + contract
npm run test:ig:e2e        # E2E con BD real (requiere credenciales locales)

git add lib/instagram tests/instagram pages/api/webhook/instagram.ts
git commit -m "restore: instagram_assistant_v1"
git push origin main       # Vercel despliega el webhook automáticamente

npm run smoke:instagram    # webhook vivo + salud de tokens
```

## Vía B — desde el backup inmutable

```bash
cp docs/backup/instagram_assistant_v1/reply-logic.ts        lib/instagram/reply-logic.ts
cp docs/backup/instagram_assistant_v1/webhook-instagram.ts  pages/api/webhook/instagram.ts
cp docs/backup/instagram_assistant_v1/instagram-comment.processor.ts workers/processors/instagram-comment.processor.ts
cp docs/backup/instagram_assistant_v1/instagram-message.processor.ts workers/processors/instagram-message.processor.ts

shasum -a 256 -c docs/backup/instagram_assistant_v1/MANIFEST.sha256   # (ajustar rutas)
npm run test:ig && git add -A && git commit -m "restore: instagram_assistant_v1 (backup)" && git push
```

## Reactivar producción tras restaurar

1. **Token:** `/settings/instagram` → reconectar por OAuth de Meta (bloqueante).
2. **Procesadores:** redeploy del worker de Railway o puente en Vercel para que
   las correcciones de código surtan efecto.
3. **Automaciones:** activar las automaciones reales de "Precio"/"Información".
4. **Verificar:** `npm run smoke:instagram` (webhook + tokens) y un comentario/DM
   real desde otra cuenta de Instagram.
