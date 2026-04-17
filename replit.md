# Winget Repo Dashboard

## Overview

A web dashboard for managing a self-hosted WinGet package repository. Users can search the official WinGet community repo (winget.run API), select packages, and mirror them into their local repo. The local repo list is managed via a PostgreSQL database.

## Features

- **Dashboard** (`/`): Shows stats (total packages, unique publishers, recently added), a filterable table of all locally hosted packages, with remove actions.
- **Search & Add** (`/search`): Debounced search against the official WinGet community repo. Packages already in the local repo are marked as "Already added" with a disabled button.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Upstream search**: GitHub Contents API (microsoft/winget-pkgs) with static popular-packages cache

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/winget-dashboard run dev` — run frontend locally

## Key Files

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/packages.ts` — DB schema for local packages
- `artifacts/api-server/src/routes/packages.ts` — Package CRUD routes
- `artifacts/api-server/src/routes/winget.ts` — Upstream winget search (GitHub Contents API + static popular packages)
- `artifacts/api-server/src/routes/winget-source.ts` — Winget REST source endpoints (manifestSearch, packageManifests)
- `artifacts/winget-dashboard/src/` — React frontend

## Deployment

- Docker Compose on 2 internal RHEL9 servers
- GitHub Actions builds Docker images → GHCR
- SSH push via `/tmp/wg-push3` clone using `scripts/ssh-git.sh`
- Push flow: `cd /tmp/wg-push3 && git remote add local /home/runner/workspace && git fetch local main && GIT_SSH_COMMAND=... git push origin <SHA>:refs/heads/main && git push origin <SHA>:refs/tags/vX.X.X`

## Version History

- **v1.0.27** (`f730c89`) — Auto-populate manifest data from winget upstream (filename `{id}.installer.yaml`, YAML Date→YYYY-MM-DD format)
- **v1.0.28** (`b219365`) — Fix package modal reopening after deletion (blockRowClickRef + setSelectedPkg reset)
- **v1.0.29** (pending auto-commit) — Fix stale version rows: `resolveVersions` now deletes null-URL rows and re-fetches from manifest to fill missing architectures (e.g. Audacity x64)
