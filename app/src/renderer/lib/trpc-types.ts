export type { Issue, Project, RouterInputs, RouterOutputs } from "@shared/trpc-types";
export type Event = import("@shared/trpc-types").RouterOutputs["issues"]["events"][number];
