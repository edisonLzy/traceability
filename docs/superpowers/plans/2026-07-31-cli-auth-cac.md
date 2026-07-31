# CLI Auth and CAC Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-31-cli-auth-cac-design.md`

**Goal:** Replace static management-token authentication with user JWT sessions while migrating the CLI command registry from Commander to CAC.

**Architecture:** Store a server URL plus an atomically persisted user session in `config.json`. Keep public login/refresh calls isolated from the protected tRPC client; protected calls refresh once after a 401 and retry once. CAC owns parsing and dispatch; command modules contain command-specific behavior only.

**Tech Stack:** TypeScript 7, Node.js 20+, CAC 7, `@clack/prompts`, tRPC 11, Vitest 4.

## Global Constraints

- Persist `{ server, user?, accessToken?, refreshToken? }` at mode `0600`; never print either token.
- Non-interactive login requires `--email <email> --password-stdin`; do not add a password flag.
- `auth.login` and `auth.refresh` are public clients with no Bearer header and no retry link.
- Every protected operation may refresh and retry exactly once; failed refresh clears session, uses TTY login only when interactive, and exits 2 otherwise.
- Remove `MANAGEMENT_AUTH_TOKEN`, `TRACEABILITY_MANAGEMENT_TOKEN`, global `--token`, and the `app` alias from the CLI.
- Preserve existing project, issue, source-map spellings and their `--json` behavior, apart from removing `app`.
- Use `import type` for pure type imports and `pnpm` for all package commands.

---

### Task 1: Install CAC/Clack and create the configuration/session primitives

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/lib/config.ts`
- Delete: `packages/cli/src/lib/config-interactive.ts`
- Create: `packages/cli/src/lib/auth.ts`
- Modify: `packages/cli/src/lib/config.test.ts`
- Delete: `packages/cli/src/lib/config-interactive.test.ts`
- Create: `packages/cli/src/lib/auth.test.ts`

**Interfaces:**
- Produces `CliConfig`, `AuthUser`, `AuthSession`, `getConfig()`, `saveConfig()`, `saveSession()`, `clearSession()`, `isInteractive()`, `promptForCredentials()`, and `AuthRequiredError`.
- `saveSession(server, session)` writes a complete replacement config through a same-directory temporary file and rename.

- [ ] **Step 1: Write failing configuration/session tests**

```ts
it("atomically persists a user and a rotated token pair", () => {
  saveSession("https://api.example", {
    user: { id: "user-1", username: "root", email: "root@example.com" },
    accessToken: "access-2",
    refreshToken: "refresh-2",
  });
  expect(getConfig()).toMatchObject({ server: "https://api.example", refreshToken: "refresh-2" });
});

it("clears only session fields", () => {
  clearSession();
  expect(getConfig()).toEqual({ server: "https://api.example" });
});
```

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `pnpm --filter @traceability/cli test -- src/lib/auth.test.ts src/lib/config.test.ts`

Expected: FAIL because session functions and the auth test module do not exist.

- [ ] **Step 3: Replace static-token configuration and add login prompts**

```ts
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export function saveSession(server: string, session: AuthSession): void {
  writeConfigAtomically({ server, ...session });
}

export function clearSession(): void {
  saveConfig({ server: getConfig().server });
}
```

Use `@clack/prompts` only to collect missing email and password in a TTY. Add `cac` and `@clack/prompts`, remove `commander` and `@inquirer/prompts`, and regenerate `pnpm-lock.yaml` with `pnpm install`.

- [ ] **Step 4: Run focused tests and type-check**

Run: `pnpm --filter @traceability/cli test -- src/lib/auth.test.ts src/lib/config.test.ts && pnpm --filter @traceability/cli typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the session primitive**

```bash
git add packages/cli/package.json pnpm-lock.yaml packages/cli/src/lib/config.ts packages/cli/src/lib/auth.ts packages/cli/src/lib/config.test.ts packages/cli/src/lib/auth.test.ts
git rm packages/cli/src/lib/config-interactive.ts packages/cli/src/lib/config-interactive.test.ts
git commit -m "feat(cli): add persisted auth sessions"
```

### Task 2: Implement public auth RPC calls and protected refresh-once client

**Files:**
- Modify: `packages/cli/src/lib/trpc.ts`
- Modify: `packages/cli/src/lib/upload.ts`
- Modify: `packages/cli/src/lib/trpc.test.ts`
- Create: `packages/cli/src/lib/upload.test.ts`

**Interfaces:**
- Consumes `AuthSession`, `saveSession`, `clearSession`, `promptForCredentials`, and `AuthRequiredError`.
- Produces `login(server, credentials)`, `refresh(server, refreshToken)`, and `getTrpcClient()` with a one-refresh, one-retry guarantee.

- [ ] **Step 1: Write failing auth transport tests**

```ts
it("uses the public client to rotate tokens then retries the protected request once", async () => {
  const result = await client.projects.list.query();
  expect(result).toEqual([]);
  expect(headers).toEqual(["Bearer expired", "Bearer rotated"]);
  expect(saved.refreshToken).toBe("refresh-2");
});

it("clears the session and throws AuthRequiredError when refresh fails outside a TTY", async () => {
  await expect(client.projects.list.query()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  expect(getConfig()).toEqual({ server: "http://mock.example" });
});
```

- [ ] **Step 2: Run focused tests and observe failure**

Run: `pnpm --filter @traceability/cli test -- src/lib/trpc.test.ts src/lib/upload.test.ts`

Expected: FAIL because the existing client uses the legacy static token and re-prompt implementation.

- [ ] **Step 3: Add isolated public clients and replace retry logic**

```ts
export async function getTrpcClient(): Promise<TRPCClient<AppRouter>> {
  const session = requireSession();
  return wrapProtectedClient({ server: getConfig().server, session });
}

async function recoverAfter401(current: AuthSession): Promise<AuthSession> {
  const next = await refresh(getConfig().server, current.refreshToken);
  saveSession(getConfig().server, { ...next, user: current.user });
  return { ...next, user: current.user };
}
```

On refresh failure, clear the local session before either interactive login or an `AuthRequiredError`. Reuse this lifecycle from the source-map uploader rather than retaining an independent 401 implementation.

- [ ] **Step 4: Run focused tests and type-check**

Run: `pnpm --filter @traceability/cli test -- src/lib/trpc.test.ts src/lib/upload.test.ts && pnpm --filter @traceability/cli typecheck`

Expected: PASS.

- [ ] **Step 5: Commit protected transport behavior**

```bash
git add packages/cli/src/lib/trpc.ts packages/cli/src/lib/upload.ts packages/cli/src/lib/trpc.test.ts packages/cli/src/lib/upload.test.ts
git commit -m "feat(cli): refresh user sessions after unauthorized requests"
```

### Task 3: Migrate command registration to CAC and add auth commands

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/auth.ts`
- Modify: `packages/cli/src/commands/config.ts`
- Modify: `packages/cli/src/commands/project.ts`
- Modify: `packages/cli/src/commands/issue.ts`
- Modify: `packages/cli/src/commands/sourcemap.ts`
- Modify: `packages/cli/src/commands/project.test.ts`
- Modify: `packages/cli/src/commands/issue.test.ts`
- Create: `packages/cli/src/commands/auth.test.ts`

**Interfaces:**
- Consumes CAC `CLI`/`Command` registrations and the auth/session helpers from Tasks 1–2.
- Produces all documented CAC commands and a root error mapper: `AUTH_REQUIRED` maps to exit 2 and cancellation maps to 130.

- [ ] **Step 1: Write failing command behavior tests**

```ts
it("reads a non-interactive password from stdin without emitting token values", async () => {
  await run(["auth", "login", "--email", "root@example.com", "--password-stdin"]);
  expect(login).toHaveBeenCalledWith("http://server", { email: "root@example.com", password: "secret" });
  expect(stdout).not.toContain("access-token");
});

it("removes the app command while preserving project list", async () => {
  await expect(run(["app", "list"])).rejects.toMatchObject({ name: "CACError" });
  await expect(run(["project", "list"])).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run focused command tests and observe failure**

Run: `pnpm --filter @traceability/cli test -- src/commands/auth.test.ts src/commands/project.test.ts src/commands/issue.test.ts`

Expected: FAIL because commands are registered with Commander and no auth command exists.

- [ ] **Step 3: Register CAC commands and implement auth command behavior**

```ts
cli.command("auth login", "Authenticate with Traceability").option("--server <url>").option("--email <email>").option("--password-stdin").action(async (options) => {
  await loginWithPrompt(options.server);
});
cli.command("auth status", "Show saved session").option("--json").action((options) => printAuthStatus(options));
cli.command("auth logout", "Remove saved session").action(logout);
```

Parse via `cli.parse(process.argv, { run: false })` and `await cli.runMatchedCommand()`. `auth` with no subcommand prints the saved user when a session exists and otherwise runs interactive login only in a TTY. `auth login` uses Clack for missing values only in a TTY; a non-TTY caller must provide `--email` and `--password-stdin`, whose entire stdin value is the password. Convert all existing command registrations to CAC, retain their existing arguments/options, and remove the `app` registration entirely. `config set` only accepts `--server`.

- [ ] **Step 4: Run command tests and CLI help smoke checks**

Run: `pnpm --filter @traceability/cli test -- src/commands && pnpm --filter @traceability/cli dev -- --help && pnpm --filter @traceability/cli dev -- auth status --json`

Expected: tests PASS; help lists `auth` and does not list `app`; status command emits no secret.

- [ ] **Step 5: Commit CAC command migration**

```bash
git add packages/cli/src/index.ts packages/cli/src/commands packages/cli/src/lib/output.ts
git commit -m "feat(cli): add cac auth commands"
```

### Task 4: Document the new credentials workflow and verify the package

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `packages/skills/setup/SKILL.md`
- Modify: `packages/skills/setup/references/cli.md`
- Modify: `docs/superpowers/specs/2026-07-31-cli-auth-cac-design.md`

**Interfaces:**
- Consumes the stable command contract from Task 3.
- Produces user and agent instructions that use `auth login` and omit management-token instructions.

- [ ] **Step 1: Update documentation examples and remove legacy token guidance**

```bash
traceability auth login --server http://localhost:3000
traceability auth status --json
traceability project create --slug checkout-web --name "Checkout Web" --json
```

State that CI authenticates with `auth login --email <email> --password-stdin` and a secret supplied on stdin rather than the removed management-token environment variable; do not document token values or root bootstrap credentials in package-facing CLI documentation.

- [ ] **Step 2: Run repository searches for removed interfaces**

Run: `rg -n "TRACEABILITY_MANAGEMENT_TOKEN|MANAGEMENT_AUTH_TOKEN|traceability app|--token <token>" packages/cli README.md packages/skills/setup`

Expected: no CLI/source/setup references remain, apart from migration-history documents.

- [ ] **Step 3: Run full CLI verification**

Run: `pnpm --filter @traceability/cli test && pnpm --filter @traceability/cli typecheck && pnpm --filter @traceability/cli build`

Expected: all commands exit 0.

- [ ] **Step 4: Commit documentation and verification changes**

```bash
git add packages/cli/README.md README.md packages/skills/setup docs/superpowers/specs/2026-07-31-cli-auth-cac-design.md
git commit -m "docs(cli): document user authentication"
```
