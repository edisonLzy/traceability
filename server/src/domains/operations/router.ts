import { desc } from "drizzle-orm";

import { managementProcedure, t } from "../../trpc/trpc.js";
import { processingFailures } from "../ingest/db.js";

export const operationsRouter = t.router({
  processingFailures: managementProcedure.query(({ ctx }) => {
    return ctx.database.db
      .select()
      .from(processingFailures)
      .orderBy(desc(processingFailures.failedAt))
      .limit(100);
  }),
});
