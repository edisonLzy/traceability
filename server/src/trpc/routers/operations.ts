import { desc } from "drizzle-orm";

import { processingFailures } from "../../db/schema/index.js";
import { managementProcedure, t } from "../trpc.js";

export const operationsRouter = t.router({
  processingFailures: managementProcedure.query(({ ctx }) => {
    return ctx.database.db
      .select()
      .from(processingFailures)
      .orderBy(desc(processingFailures.failedAt))
      .limit(100);
  }),
});
