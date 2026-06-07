#!/usr/bin/env bash
# Smoke test FASE 3: il consumer QStash deve rifiutare richieste senza firma
# valida. Avvia prima `pnpm dev` in un altro terminale.
# Atteso: HTTP 401 per entrambi i casi (firma mancante e firma garbage).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
JOB_URL="${BASE_URL}/api/jobs/data-export"

# UA non filtrato da 4.block-bots.ts (curl/wget sono bloccati con 403).
UA="Upstash-QStash-Smoke"

echo "== Caso 1: firma mancante =="
code_missing=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${JOB_URL}" \
  -A "${UA}" \
  -H "Content-Type: application/json" \
  -d '{"exportId":"x","userId":"y"}')
echo "HTTP ${code_missing} (atteso 401)"

echo "== Caso 2: firma garbage =="
code_garbage=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${JOB_URL}" \
  -A "${UA}" \
  -H "Content-Type: application/json" \
  -H "upstash-signature: not-a-valid-signature" \
  -d '{"exportId":"x","userId":"y"}')
echo "HTTP ${code_garbage} (atteso 401)"

if [ "${code_missing}" = "401" ] && [ "${code_garbage}" = "401" ]; then
  echo "SMOKE PASS: entrambe le richieste rifiutate con 401"
  exit 0
else
  echo "SMOKE FAIL: atteso 401/401, ottenuto ${code_missing}/${code_garbage}"
  exit 1
fi
