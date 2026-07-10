# Restaurar el recepcionista estable (`sales_assistant_v1`) — < 5 minutos

Dos vías. Ambas restauran el módulo a la versión estable congelada.

## Vía A — desde el tag de git (recomendada)

```bash
# 1. Restaurar los ficheros del módulo a la versión estable
git checkout sales_assistant_v1 -- lib/sales app/api/sales tests/sales

# 2. Verificar que los tests pasan
npm test            # 27 unit + contract
npm run test:e2e    # 5 E2E (requiere credenciales locales)

# 3. Commit + deploy
git add lib/sales app/api/sales tests/sales
git commit -m "restore: sales_assistant_v1"
git push origin main        # Vercel despliega automáticamente

# 4. Smoke post-deploy
npm run smoke:sales
```

## Vía B — desde el backup inmutable (si el tag no está disponible)

```bash
# Copiar los ficheros del snapshot
cp docs/backup/sales_assistant_v1/knowledge.ts   lib/sales/knowledge.ts
cp docs/backup/sales_assistant_v1/assistant.ts   lib/sales/assistant.ts
cp docs/backup/sales_assistant_v1/config.ts      lib/sales/config.ts
cp docs/backup/sales_assistant_v1/slots.ts       lib/sales/slots.ts
cp docs/backup/sales_assistant_v1/api-run-route.ts app/api/sales/run/route.ts

# Verificar integridad contra el manifiesto
shasum -a 256 -c docs/backup/sales_assistant_v1/MANIFEST.sha256   # (ajustar rutas)

npm test && git add -A && git commit -m "restore: sales_assistant_v1 (backup)" && git push
```

## Configuración de producción a re-verificar tras restaurar

- Automatizaciones `Asistente comercial — Love Fitness` (message_received) y
  `(primer mensaje)` (first_message): el nodo `act-sales` debe ser la acción
  nativa `sales_assistant` **o** `send_webhook` a `/api/sales/run` (según si el
  worker de Railway ya corre el código nuevo).
- El gate `cond-gate` debe incluir la etiqueta ancla `cliente-potencial` y los
  saludos genéricos (hola, buenas, información, precio…) para que el
  recepcionista salude cualquier mensaje entrante.
- Tabla `sales_config` (opcional): sin fila = defaults del código.

## Verificación final (obligatoria)

Enviar desde un WhatsApp real:
1. "Hola" → saludo recepcionista (elige 1/2).
2. "1" → menú gimnasio · "quiero apuntarme" → `https://www.lovefitness.es`.
3. "2" → info online · "quiero contratar" → `https://www.transformacuerpo.com`.

Si los enlaces son correctos y no se cruzan → restauración correcta.
