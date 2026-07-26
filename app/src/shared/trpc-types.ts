import type { AppRouter } from "@traceability/server/trpc";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type Project = RouterOutputs["projects"]["list"][number];
export type Issue = NonNullable<RouterOutputs["issues"]["get"]>;
