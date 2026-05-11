# SynthNews Cleanup Roadmap

Last updated: 2026-05-12

## Goal

Reduce unused complexity without breaking the production flow: RSS/web/forum fetch, AI summarization, reader UI, admin operations, and Docker deploy.

## Order of work

### 1. Deployment hygiene

Status: Complete on VPS as of 2026-05-12

- Audit untracked files on VPS at `/home/ubuntu/newstamhv`.
- Classify each untracked file as keep, commit, ignore, backup, or delete.
- Do not delete production files until they are classified.
- Ensure production deploy comes from a clean and reproducible source state.

VPS untracked classification from 2026-05-12:

- Backed up all untracked files to `/home/ubuntu/newstamhv-untracked-backup-20260512-013524.tar.gz` before deletion.
- Removed backed-up artifacts/debug files: `client/dist_old/`, generated `client/vite.config.*`, generated `trigger-digest.*`, `test_integration*.mjs`, `test_reddit.cjs`, `test_rss.mjs`.
- Removed backed-up VPS-only page files: `client/src/pages/AiProviders.tsx` (476 lines), `client/src/pages/Articles.tsx` (380 lines), `client/src/pages/Layout.tsx` (50 lines), `client/src/pages/Settings.tsx` (132 lines). Local repo only has tracked `Home.tsx`, `Admin.tsx`, and `Sources.tsx`.
- Verified `git status --short` on VPS is clean and `newstamhv-app`/`newstamhv-db` containers remain healthy.

### 2. Remove unused YouTube support

Status: Completed locally, pending deploy

- Remove YouTube fetcher code and tests.
- Remove YouTube source detection/registration paths.
- Remove YouTube/RapidAPI environment examples if they are only used for YouTube.
- Update README/docs so YouTube is no longer described as supported.
- Keep already-applied database migrations intact unless a new migration is needed.

### 3. Local validation

Status: Complete

- Server tests pass: `npm --prefix d:\\Antigravity\\newstamhv run test --workspace=server`.
- Client tests pass: `npm --prefix d:\\Antigravity\\newstamhv run test --workspace=client`.
- Full build passes: `npm --prefix d:\\Antigravity\\newstamhv run build`.
- Stale client tests were updated for current service worker/mobile toolbar behavior, and `persistentCache.ts` was restored to match existing offline cache tests.

### 4. Deploy and observe

Status: Ready after commit/push

- Commit and push only after local validation passes.
- Let GitHub Actions deploy to VPS.
- Check container health and recent logs after deploy.
- Confirm scrape/summarize still works for active RSS/web/forum sources.

Pre-commit status from 2026-05-12:

- Server tests pass: 68/68.
- Client tests pass: 30/30.
- Full build passes.
- Local diff is mainly YouTube removal, stale test alignment, `persistentCache.ts` restoration, roadmap, and README/env/deploy cleanup.
- No real secrets found in changed files; secret-looking matches are placeholders in examples/docs.
- Review whether to include untracked `AUDIT_OVER_ENGINEERING_2026-05-10.md` in the commit or leave it untracked.

### 5. Stabilize Reddit/comment fetching

Status: Not started

- Finish Cloudflare Worker proxy if still needed.
- Observe Reddit comment fetch success for several scrape cycles.
- Remove fallback strategies that no longer help after proxy is stable.
- Keep logging focused on comments fetched, useful comments, and skip reason.

### 6. Split large frontend files

Status: Not started

- Split `Admin.tsx` into feature panels.
- Split `Home.tsx` into reader/feed/detail components.
- Keep behavior unchanged while splitting.
- Validate visually in browser after each UI step.

### 7. Reduce CSS size gradually

Status: Not started

- Group or split CSS by base/layout/home/admin/components.
- Remove duplicate/dead rules only after checking UI.
- Avoid broad redesign during cleanup.

## Progress notes

- 2026-05-12: Roadmap created. Verified VPS is running healthy containers, but `/home/ubuntu/newstamhv` has multiple untracked files/build artifacts. Verified local code still contains YouTube leftovers while production DB source types are only `rss` and `web`.
- 2026-05-12: Removed active YouTube runtime support locally: deleted fetcher/tests, removed fetcher routing, removed YouTube env/deploy variables, updated README/Home copy, and deleted obsolete YouTube planning docs. Kept source resolver/route validation that blocks YouTube URLs and kept legacy migration history.
- 2026-05-12: Validation results after stale test cleanup: server tests pass, client tests pass, full build passes.
- 2026-05-12: VPS untracked files were backed up to `/home/ubuntu/newstamhv-untracked-backup-20260512-013524.tar.gz`, then removed from the working tree. VPS `git status --short` is clean and containers remain healthy.
- 2026-05-12: Final pre-commit validation: server tests 68/68 pass, client tests 30/30 pass, full build passes. Diff reviewed for secrets; only placeholders found.
