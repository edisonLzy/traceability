import { procedure, t } from "../../trpc/trpc.js";

export const processingRouter = t.router({
  processingFailures: procedure.query(({ ctx }) => ctx.container.processing.listFailures()),
});
