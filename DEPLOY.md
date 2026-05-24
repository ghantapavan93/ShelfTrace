# Deploying ShelfTrace — Render (backend) + Vercel (frontend)

This walks through a free-tier deploy that keeps the Working Platform live
for reviewers. No paid plans, no credit card.

> **What "free" buys you:**
> - **Web** spins down after 15 min idle. First request after a sleep takes
>   ~30 s while the container cold-starts. Subsequent requests are normal.
> - **Postgres** auto-expires 90 days after creation.
> - **Redis** auto-expires 30 days after creation.
> - **No background worker.** Render has no free worker tier. The API
>   drains the outbox inline on `POST /price-batches` already
>   (`backend/app/routers/batches.py`), so the demo works end-to-end. You
>   only need a separate worker if you simulate sustained multi-tenant
>   load — not a concern for a portfolio piece.

---

## 1. Backend — Render Blueprint

The repo includes `render.yaml` defining three resources:
- `shelftrace-api` — FastAPI web service, free plan
- `shelftrace-db` — Managed Postgres 16, free plan
- `shelftrace-redis` — Managed Redis, free plan

### Steps

1. Push the repo to GitHub.
2. In Render dashboard → **New → Blueprint** → connect the repo.
3. Render reads `render.yaml`, shows the three services, prompts for
   confirmation. Click **Apply**.
4. Wait ~5 min for Postgres + Redis to provision and the API container to
   build. Visit `https://shelftrace-api.onrender.com/health` — you should
   see `{"status":"ok","db":"ok","redis":"ok"}`.
5. The startup `lifespan` hook auto-seeds the Memorial Day / Dallas Zone 2
   demo batch when `DEMO_MODE=true`. Confirm by hitting
   `/api/v1/operations/overview` — should return a batch with 4 actions.

### After Vercel is up — set CORS

Once the frontend lives at `https://<your-name>.vercel.app`:

```
Render dashboard → shelftrace-api → Environment →
  CORS_ORIGINS = https://<your-name>.vercel.app,http://localhost:3000
```

Trigger a manual redeploy. The frontend can now talk to the API without
"CORS policy: No 'Access-Control-Allow-Origin' header" errors.

### (Optional) Lock down writes

Default deploy is fully open for the demo. To require an API key on
mutating endpoints (POST/PATCH/DELETE):

```
API_KEYS_JSON = {"reviewer-key-xyz":{"role":"viewer","actor":"Reviewer"}}
```

Reads stay open; writes require `Authorization: Bearer reviewer-key-xyz`.
The frontend currently doesn't send a key — leave this empty unless you
also patch `lib/api.ts` to attach one.

---

## 2. Frontend — Vercel

1. In Vercel dashboard → **Add New → Project** → import the same GitHub repo.
2. **Critical:** set **Root Directory** to `frontend` in the project's
   General settings. Without this, Vercel tries to build at repo root
   and fails (no `package.json` there).
3. Framework preset auto-detects as **Next.js**.
4. Add one environment variable under **Settings → Environment Variables**:

   | Key | Value | Scope |
   |---|---|---|
   | `NEXT_PUBLIC_API_URL` | `https://shelftrace-api.onrender.com` | Production, Preview |

   > `NEXT_PUBLIC_*` vars are baked at build time. Changing this requires
   > a redeploy.

5. Click **Deploy**. First build takes ~3 min.
6. Visit `https://<your-name>.vercel.app/vision/keynote`. The page loads
   immediately (static). Visit `/operations` — first request triggers a
   ~30 s Render cold-start. Subsequent navigation is fast.

---

## 3. The 5-minute smoke test

After both services are live:

```bash
# 1. Health
curl https://shelftrace-api.onrender.com/health

# 2. Demo batch present?
curl https://shelftrace-api.onrender.com/api/v1/operations/overview | jq .batch.external_id

# 3. Frontend talks to backend?
#    Open https://<your-name>.vercel.app/operations in a browser. Should
#    show "Memorial Day Weekend Promotion" batch with 4 actions.

# 4. Run the recovery loop manually
#    /operations/incidents → click the open incident → Retry POS Update
#    Confirm: incident transitions retrying → resolved.
```

---

## 4. Realistic limitations to mention in the README / cover letter

- This is a **demo deploy**, not production-grade hosting.
- The free Postgres expires on day 90; the demo batch is auto-re-seeded
  on every container boot, so the data itself isn't precious.
- Cold-starts can confuse first-time visitors. If you share the link in
  a job application, mention "first click may take ~30s while the demo
  container wakes."
- No autoscaling, no failover, no PITR. For a portfolio piece this is
  the right tradeoff. For a real reliability product (which is what
  ShelfTrace *describes*), you'd be on paid plans with read replicas,
  a real worker process, and a managed Redis with persistence.

---

## 5. If you decide to upgrade later

Switch the free tiers to **Starter** (~$7/mo each — about $25/mo total
including a worker):

1. In `render.yaml`, change every `plan: free` to `plan: starter`.
2. Add a worker service:

   ```yaml
   - type: worker
     name: shelftrace-worker
     runtime: docker
     dockerfilePath: ./backend/Dockerfile
     dockerContext: ./backend
     plan: starter
     dockerCommand: python -m app.worker
     envVars:
       - key: DATABASE_URL
         fromDatabase: { name: shelftrace-db, property: connectionString }
       - key: REDIS_URL
         fromService: { type: redis, name: shelftrace-redis, property: connectionString }
   ```

3. Commit, push, Render picks it up automatically.

That's it. The Blueprint flow handles the rest.
