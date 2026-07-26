import type { AppRouterInputs, AppRouterOutputs } from "@traceability/server/trpc";

export type { AppRouterInputs, AppRouterOutputs };

export type Project = AppRouterOutputs["projects"]["list"][number];
export type Issue = NonNullable<AppRouterOutputs["issues"]["get"]>;
