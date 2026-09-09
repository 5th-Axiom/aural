import { questionsForCandidate } from "@/lib/session-question-scope";
import { getAuthUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/voice/token");

/**
 * POST /api/voice/token
 * Validate the interview exists and return session metadata.
 */
export async function POST(req: Request) {
  const { interviewId, sessionId } = await req.json();

  try {
    const user = await getAuthUser();
    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("interviewId", interviewId)
      .single();
    if (
      !session ||
      (session.participantUserId && session.participantUserId !== user?.id)
    )
      return NextResponse.json(
        { error: "请使用面试手机号登录" },
        { status: 403 },
      );
    const { data: interview } = await supabaseAdmin
      .from("interviews")
      .select("*, questions(*)")
      .eq("id", interviewId)
      .order("order", { referencedTable: "questions", ascending: true })
      .single();

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 },
      );
    }

    const questions = questionsForCandidate(
      interview.questions ?? [],
      session.candidateId,
    );

    return NextResponse.json({
      sessionId,
      interviewTitle: interview.title,
      aiName: interview.aiName,
      questionCount: questions.length,
    });
  } catch (error) {
    log.error("Voice session init error:", error);
    return NextResponse.json(
      { error: "Failed to initialize voice session" },
      { status: 500 },
    );
  }
}
