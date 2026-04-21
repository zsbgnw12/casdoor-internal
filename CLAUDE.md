# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository context

This is `casdoor-internal` — an internal fork of [casdoor/casdoor](https://github.com/casdoor/casdoor) (IAM / auth server) that runs custom changes and deploys to Azure Container Apps (ACA). Full deploy / rollback / troubleshooting details live in [DEPLOY.md](DEPLOY.md) — read it before touching CI, Dockerfile, or infra.

Upstream sync: `upstream` remote points at `github.com/casdoor/casdoor`. When merging, re-preserve the local Dockerfile patches (`sh ./build.sh`, `CI=false`) — see DEPLOY.md §6.

## Common commands

Backend (Go 1.25, Beego, xorm):

```bash
make run            # go run ./main.go — local dev server on :8000
make backend        # fmt + vet + build -> bin/manager
make ut             # go test -v -cover ./...
make lint           # golangci-lint (gofumpt-only ruleset, see .golangci.yml)
make lint-install   # install pinned golangci-lint v2.11.4 via go1.25.8
make fmt && make vet
go test -run TestName ./object/...   # single test
```

Frontend (React 18, CRA via craco, yarn — npm is blocked by `preinstall`):

```bash
cd web
yarn                # install (first time)
yarn start          # dev server on :7001 (PORT=7001 hardcoded)
yarn build          # craco build -> web/build, then mv.js moves assets
yarn fix            # eslint --fix on src/**
yarn lint:css       # stylelint --fix
```

Full image build: `make docker-build` (multi-stage Dockerfile builds both backend and frontend). For deploy, just `git push` to `master`/`main` — GitHub Actions handles ACR push + `az containerapp update`.

## Configuration

- `conf/app.conf` — Beego config (DB DSN, redis, ports). **Tracked but marked `skip-worktree`** on local clones; don't `git add` local credential changes.
- `docker-compose.yml` — also `skip-worktree` locally.
- DB: PostgreSQL (Azure PG in prod, `dataope.postgres.database.azure.com`). xorm auto-migrates schema on boot — adding a field to an `object/*.go` struct will `ALTER TABLE` on next start.
- Sessions: file-backed in `./tmp/` unless `redisEndpoint` is set in app.conf.

## Architecture

Monolith: single Go binary serves both the REST API and (in prod) the built React SPA.

```
main.go
  └─ routers.InitAPI()        routers/router.go — Beego route table
  ├─ object.Init*             DB bootstrap, table creation, background jobs
  ├─ web.InsertFilter(...)    filter chain (routers/*_filter.go): static,
  │                           auto-signin, CORS, timeout, API auth, prom, record
  ├─ go ldap.StartLdapServer
  ├─ go radius.StartRadiusServer
  └─ web.Run(:httpport)       Beego HTTP (default 8000)
```

Key package boundaries — understand these before cross-cutting changes:

- `controllers/` (74 files) — HTTP handlers. All inherit from `controllers.ApiController` (base.go). Route → controller wiring lives in `routers/router.go`.
- `object/` — domain models + DB access via xorm (`ormer.go`, `ormer_session.go`). Struct tags drive schema; adding a field triggers auto-`ALTER TABLE` at boot. This is where business logic lives — controllers are thin.
- `authz/` — Casbin enforcer for API-level auth. Public (unauthenticated) endpoints need an explicit allow rule here (see [authz/authz.go](authz/authz.go) — e.g. the `/api/public/bing-background` entry).
- `routers/` — Beego filters (filter chain order in main.go matters) + route registration.
- `idp/` — pluggable external identity providers (OAuth/OIDC/SAML/LDAP/etc.).
- `ldap/`, `radius/`, `scim/`, `mcp/`, `mcpself/` — alternative protocol servers, each started from main.go.
- `service/` — site-monitor background workers (only started when `SiteMap` non-empty).
- `sync/`, `sync_v2/` — user sync adapters (LDAP/DB → casdoor).
- `i18n/` + `web/src/locales/{en,zh,...}/data.json` — translations; backend uses the Go-side i18n, frontend uses i18next. Crowdin syncs both (`crowdin.yml`).
- `web/src/` — React SPA entry [App.js](web/src/App.js), login surface in [EntryPage.js](web/src/EntryPage.js), per-entity admin pages named `*EditPage.js` / `*ListPage.js`.

### Adding a public (unauth) API endpoint

Pattern from the Bing-background change (DEPLOY.md §4.1):

1. Handler in `controllers/<feature>.go` hanging off `ApiController`.
2. Route in `routers/router.go`.
3. **Allow rule in `authz/authz.go`** — without this, the `ApiFilter` returns 401.

### Adding a field to a domain object

Edit the struct in `object/<thing>.go`, add xorm tags, restart — xorm auto-migrates. No manual migration file. Then surface it in the matching `web/src/<Thing>EditPage.js` form and in `web/src/locales/{en,zh}/data.json`.

## Conventions worth knowing

- Commit subjects are short Chinese or conventional-commits style (`feat:`, `fix:`) — see `git log`.
- ESLint/stylelint run via husky pre-commit (`lint-staged`). CI builds the frontend with `CI=false` so warnings don't fail the build — keep the source clean locally anyway.
- `TestGetVersionInfo` reads `.git/` at runtime; never add `.git/` to `.dockerignore` or CI will break (regression documented in DEPLOY.md §5).
- Frontend background-image decision logic lives in `EntryPage.resolveBgUrl` — iframe mode disables backgrounds, `formBackgroundUrl` wins over the Bing toggle.
