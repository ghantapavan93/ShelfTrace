#!/usr/bin/env bash
# Full real-infrastructure verification: Postgres + Redis + worker + API + UI.
# Run after Docker Desktop is started:  bash verify.sh
set -e

echo "==> 1. Is Docker running?"
docker info >/dev/null 2>&1 || { echo "Docker daemon is not running. Start Docker Desktop first."; exit 1; }
docker info --format '{{.ServerVersion}}' | sed 's/^/Docker server /'

echo "==> 2. Build & start the stack (postgres, redis, backend, worker, frontend)"
docker compose up -d --build

echo "==> 3. Wait for the API to be healthy"
for i in $(seq 1 40); do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then echo "API healthy"; break; fi
  sleep 3
done
curl -s http://localhost:8000/health; echo

echo "==> 4. Services running"
docker compose ps

echo "==> 5. Postgres sanity (tables created)"
docker compose exec -T postgres psql -U shelftrace -d shelftrace_db -c "\dt"

echo "==> 6. Redis sanity"
docker compose exec -T redis redis-cli ping

echo "==> 7. Worker log (outbox processing)"
docker compose logs --tail=15 worker

echo "==> 8. Test suite against PostgreSQL (all 15, incl. row-lock concurrency)"
docker compose exec -T backend pytest -q

echo "==> 9. Prove the LIVE state sequence over the API (reset -> egg -> strawberry -> expand)"
docker compose exec -T backend python -m tests.prove_sequence

echo "==> 10. Prove the CERTIFICATION lab over the API (shared engine + pass/fail + remediation)"
docker compose exec -T backend python -m tests.prove_certification

echo "==> 11. Restore canonical default demo states (live blocked, certification failed)"
curl -s -X POST http://localhost:8000/api/v1/demo/reset >/dev/null && echo "live -> blocked"
curl -s -X POST http://localhost:8000/api/v1/certification/demo/reset >/dev/null && echo "certification -> failed_pending_remediation"

echo
echo "ALL VERIFIED. Frontend: http://localhost:3000   API docs: http://localhost:8000/docs"
