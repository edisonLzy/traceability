import { procedure, t } from "../../trpc/trpc.js";

export const realtimeRouter = t.router({
  createTicket: procedure.mutation(({ ctx }) => {
    return ctx.container.realtime.createTicket(ctx.user!.id);
  }),
});
