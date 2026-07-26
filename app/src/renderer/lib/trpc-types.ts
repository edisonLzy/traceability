export type { AppRouterInputs, AppRouterOutputs, Issue, Project } from "@shared/trpc-types";
export type Event = import("@shared/trpc-types").AppRouterOutputs["issues"]["events"][number];
