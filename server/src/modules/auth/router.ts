import { z } from "zod";

import { publicProcedure, t } from "../../trpc/trpc.js";

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export const authRouter = t.router({
  login: publicProcedure
    .input(credentialsSchema)
    .mutation(({ ctx, input }) => ctx.container.auth.login(input)),
  refresh: publicProcedure
    .input(refreshSchema)
    .mutation(({ ctx, input }) => ctx.container.auth.refresh(input)),
});
