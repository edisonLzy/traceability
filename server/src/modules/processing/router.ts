import { managementProcedure, t } from "../../trpc/trpc.js";

export const processingRouter = t.router({
  processingFailures: managementProcedure.query(({ ctx }) =>
    ctx.services.processing.listFailures(),
  ),
});
