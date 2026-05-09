# Local production-like testing

Use `https://synthnews.local` to test local changes without overriding production `https://synthnews.site`.

## One-time setup

1. Install Caddy.
2. Add this line to `C:\Windows\System32\drivers\etc\hosts` as Administrator:

```text
127.0.0.1 synthnews.local
```

3. Check hosts:

```powershell
npm run local:check-hosts
```

4. Copy env template and fill local secrets:

```powershell
Copy-Item .env.local.example .env.local
```

At minimum, set `ADMIN_TOKEN`. Keep `.env.local` uncommitted.

5. Start local Postgres. Existing Docker Compose exposes DB at `127.0.0.1:5433`:

```powershell
docker compose up -d db
```

## Run production-like local app

Terminal 1:

```powershell
npm run local:prod
```

Terminal 2:

```powershell
caddy run --config Caddyfile.local
```

Open:

```text
https://synthnews.local
```

If browser warns about certificate, trust Caddy local CA or continue only for this local domain.

## Verify before commit/push

```powershell
npm run build --workspace=server
npm test --workspace=server
```

Manual checks:

- `https://synthnews.local/api/health/live` returns success.
- Home feed loads.
- `/sources` loads.
- Admin write actions use local `ADMIN_TOKEN`.
- Article detail routes load via SPA fallback.
- `https://synthnews.site` still opens VPS production.

## Docker app parity

If running full app container, Docker exposes the app at `127.0.0.1:3001`. Change `Caddyfile.local` proxy target from `127.0.0.1:3000` to `127.0.0.1:3001`.
