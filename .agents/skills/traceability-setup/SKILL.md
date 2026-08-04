---
name: traceability-setup
description: Use when the user asks to set up / install / configure traceability monitoring in a project, or to create a Traceability project (在项目里接入/安装/配置 traceability 监控 SDK / 创建 project). Walks through pre-checking the CLI, detecting the stack, creating or locating a project, and wiring the SDK.
---

# Setup Skill

When the user says "在项目里接入/安装/配置 traceability 监控 / 创建 project" or "set up / install / configure traceability in this project", follow this workflow.

This skill targets projects **inside this monorepo** (dependencies use `workspace:*`). It does not publish packages. The SDK is the single package `@tracerability/monitor`; subpaths select the platform (`@tracerability/monitor` = browser, `@tracerability/monitor/react`, `@tracerability/monitor/electron-main`, `@tracerability/monitor/electron-renderer`).

## 0. Pre-check the CLI

```bash
traceability auth status --json
```

- **Authenticated** (the JSON has `authenticated: true`) -> the CLI is ready.
- **Fails** -> tell the user to run:
  ```bash
  traceability auth login --server <url>
  ```
  then retry. If `traceability` isn't on PATH, use `pnpm --filter @tracerability/cli exec traceability …` (see `references/cli.md`).

After this step, never read or print the CLI session tokens.

The session points at a server but `auth status` only reads local config. If the server isn't reachable, `project create` / `issue list` will hang or fail — start it first (`cd server && pnpm dev`; requires Postgres/Redis, `pnpm db:up` per `server/.env.example`).

## 1. Detect the stack

- **Electron** if any of: `package.json` has `electron` in dependencies/devDependencies; `main` points at an electron entry; `electron-vite` / `electron-builder` present; source imports from `"electron"`.
- **Web** otherwise (Vite/webpack/Next/Nuxt/… with no electron signal).
- If ambiguous (both an electron main and a separate web build), default to **Electron** and tell the user (they can override).

Select `references/web-setup.md` or `references/electron-setup.md`.

## 2. Project

Ask the user whether a Traceability project already exists for this codebase.

- **Already exists** -> ask for the **projectId** used by management commands. Validate it and fetch its DSN:
  ```bash
  traceability project show <projectId> --json
  ```
  Take `project.id` for management commands and `connections[0].dsn` for the SDK config.
- **Does not exist** -> pre-fill the project fields from the codebase, present them for confirmation/edit, then create:
  - `slug` ← a URL-safe form of `package.json` `name`
  - `name` ← `package.json` `name`
  ```bash
  traceability project create --name <name> --slug <slug> --json
  ```
  The response returns `{ project, key, dsn }` — take `project.id` for management commands and `dsn` for the SDK config. (`sentryProjectId` is already embedded in the DSN path.)

> The DSN is the only credential the SDK needs: the public key rides in its username (`http://<publicKey>@<server>/<sentryProjectId>`), the project in its path. The SDK has **no** `token`/`appId` option. Treat the DSN's public key like a secret — never print it or commit it.

## 3. Install deps + write config

Follow the chosen reference:

1. Add the dependency (`workspace:*`) and run `pnpm install` at the repo root:
   - Web: `@tracerability/monitor` (the `./react` subpath is part of the same package — no extra install).
   - Electron: `@tracerability/monitor` (main + renderer subpaths).
2. Write the project's `.env` / `.env.local` and fill in `TRACEABILITY_DSN` / `VITE_TRACEABILITY_DSN` with the DSN from Step 2. No token entry — the DSN's public key authenticates ingest.
3. Write the monitor module + wire the entry point (per the reference doc).
4. Ensure `.env*` is in `.gitignore` (add it if missing) — the DSN public key must not be committed. Never clobber an existing value.

## 4. Verify

Run the project; trigger one event (`captureException(new Error("setup check"))`). Confirm it appears in the Inbox UI, or:

```bash
  traceability issue list --project-id <projectId>
```

For web projects, sourcemaps can be uploaded separately (`traceability sourcemap upload`, see `references/cli.md`) so production stack traces symbolicate.

## 5. Commit

```bash
git add -A
git commit -m "feat: set up traceability monitoring"
```

Tell the user the project id, that events should now appear in the Inbox, and (web) that sourcemaps can be uploaded with `traceability sourcemap upload`.
