import { TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { verifyInterviewAccess } from "./routers/candidate";
/** Legacy unbound sessions retain their link access; phone sessions require their participant or an authorized interviewer. */
export async function assertSessionAccess(ctx: Context, sessionId: string) {
  const { data: session } = await ctx.supabase
    .from("sessions")
    .select("interviewId,participantUserId,candidateId")
    .eq("id", sessionId)
    .single();
  if (!session)
    throw new TRPCError({ code: "NOT_FOUND", message: "面试记录不存在" });
  if (session.participantUserId && session.participantUserId !== ctx.user?.id) {
    if (!ctx.user)
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "请先使用面试手机号登录",
      });
    await verifyInterviewAccess(ctx.supabase, session.interviewId, ctx.user.id);
  }
  return session;
}
