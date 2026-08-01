# Login Form & tRPC Error Handling

**Date:** 2026-08-01
**Status:** approved

## Scope

- Introduce `react-hook-form` for client-side form validation
- Fix `TrpcErrorToaster` to also catch mutation errors (currently only queries)
- Remove login form's generic catch block — all server/network errors handled by toaster

## Out of scope

- Client-side zod resolver / shared schema (deferred)
- Custom tRPC error link (deferred)
- Login-related visual redesign beyond form wiring

---

## 1. react-hook-form adoption

**Install:** `react-hook-form` in `app/`.

**Login page (`src/renderer/pages/Login/index.tsx`):**

- Replace three `useState` calls with `useForm({ defaultValues })`.
- Fields use `register("email", { required: true, pattern: /^\S+@\S+$/i })` and `register("password", { required: true })`.
- `handleSubmit` calls `rendererTrpcClient.auth.login.mutate(...)`.
- On success → `onAuthenticated(result)`.
- **No catch block** — errors surface via the global toaster.
- Field-level error text rendered beneath each input via `formState.errors`.
- `formState.isSubmitting` replaces the manual `loading` state; `disabled={isSubmitting}` on the button.
- `email` input `type` stays `"email"` for browser autofill hints.

### Decision: Form values type derived from the router inputs

`LoginFormValues` is not defined by hand. `shared/trpc-types.ts` already re-exports the router input mapping (`AppRouterInputs` comes from `@traceability/server/trpc`, which defines it via `inferRouterInputs<AppRouter>`). The login form imports it from the shared contract:

```ts
import type { AppRouterInputs } from "@shared/trpc-types";
type LoginFormValues = AppRouterInputs["auth"]["login"];
```

This keeps the client and server input schema in sync — if the server's `credentialsSchema` changes, the form type updates automatically. No new dependency needed (`@trpc/server` was briefly added then reverted once it was discovered that `@traceability/server/trpc` already exports the type).

### Decision: No zod resolver

Using `register` options (required, pattern) rather than `@hookform/resolvers` + zod. Server already validates; the client-side check is a quick UX guard, not a security boundary.

---

## 2. TrpcErrorToaster — add MutationCache

**File:** `src/renderer/components/TrpcErrorToaster.tsx`

- Keep existing `QueryCache.subscribe()` logic.
- Add a parallel `MutationCache.subscribe()` inside the same `useEffect`.
- Filter `event.type === "updated"` with `event.action.type === "error"`, same pattern.
- Extract the error from `event.mutation.state.error`.
- Both subscriptions return cleanup functions — use a single `useEffect` returning a combined cleanup.
- `formatTrpcError` stays as-is (already handles `UNAUTHORIZED`, generic message fallback).

---

## 3. formatTrpcError enhancement

**File:** `src/renderer/components/TrpcErrorToaster.tsx`

Enhance `formatTrpcError` to better handle different error scenarios:

```ts
export function formatTrpcError(error: {
  message?: string;
  data?: { code?: string; httpStatus?: number } | null;
}): string {
  if (error.data?.code === "UNAUTHORIZED") return "邮箱或密码不正确。";
  if (error.data?.code === "BAD_REQUEST") return "请求参数有误。";
  // Network / CORS errors typically lack data and have a short message
  if (!error.data && error.message?.includes("fetch"))
    return "网络连接失败，请检查服务器是否启动。";
  return error.message?.trim() || "服务请求失败。";
}
```

Note: `TrpcErrorToaster.test.ts` currently has a placeholder test. Update the mock and add test cases for the new error codes.
