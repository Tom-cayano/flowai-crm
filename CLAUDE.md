# REPOSITORY SAFETY RULES

Repositorio único autorizado:

/Users/wellitonbatistadasilva/AI_PROJECTS/crm-whatsapp

Antes de cualquier modificación ejecutar:

pwd
git rev-parse --show-toplevel
git rev-parse --short HEAD

Si la ruta no coincide exactamente con:

/Users/wellitonbatistadasilva/AI_PROJECTS/crm-whatsapp

detener la ejecución.

Antes de afirmar que un cambio existe, mostrar:

git diff -- <archivo>

Antes de afirmar que un commit existe, mostrar:

git log --oneline -5

Antes de afirmar que un bug está resuelto, ejecutar:

npm run build

No inventar commits.
No inventar pushes.
No inventar deploys.
No asumir cambios no verificados.

@AGENTS.md
