import { managementProcedure, t } from "../../trpc/trpc.js";

export const operationsRouter = t.router({
  processingFailures: managementProcedure.query(({ ctx }) =>
    ctx.services.operations.listProcessingFailures(),
  ),
});
