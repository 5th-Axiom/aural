import OpenAI from "openai";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyInterviewAccess } from "@/server/routers/candidate";
import { assertMinRole } from "@/server/trpc";
import { RESUME_QUESTIONS_PROMPT } from "@/lib/prompts/resume-questions";
import {
  retryValidated,
  validateResumeQuestions,
} from "@/lib/resume-questions";
import { checkRateLimit } from "@/lib/api-rate-limit";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string }>;
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const limited = checkRateLimit(`resume:${user.id}`);
  if (limited) return limited;
  try {
    const form = await request.formData();
    const candidateId = z.string().uuid().parse(form.get("candidateId"));
    const { data: candidate } = await supabaseAdmin
      .from("candidates")
      .select("id,interviewId,sessionId")
      .eq("id", candidateId)
      .single();
    if (!candidate)
      return Response.json({ error: "候选人不存在" }, { status: 404 });
    const { role } = await verifyInterviewAccess(
      supabaseAdmin,
      candidate.interviewId,
      user.id,
    );
    assertMinRole(role, "MEMBER");
    if(candidate.sessionId) return Response.json({error:"候选人已开始面试，不能替换专属问题"},{status:409});
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
      return Response.json(
        { error: "请上传不超过 5 MB 的 PDF 或 TXT 简历" },
        { status: 400 },
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    let text = "";
    if (
      /\.pdf$/i.test(file.name) &&
      bytes.subarray(0, 5).toString() === "%PDF-"
    )
      text = (await pdfParse(bytes)).text;
    else if (/\.(txt|md)$/i.test(file.name))
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    else
      return Response.json(
        { error: "仅支持包含文字的 PDF、TXT 或 Markdown 简历" },
        { status: 400 },
      );
    text = text.trim();
    if (text.length < 30 || text.length > 40000)
      return Response.json(
        { error: "简历需包含 30–40000 个字符；扫描件请先转换为文字" },
        { status: 400 },
      );
    const { data: interview } = await supabaseAdmin
      .from("interviews")
      .select("title,roleTitle,objective,questions(text,candidateId)")
      .eq("id", candidate.interviewId)
      .single();
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      maxRetries: 0,
      timeout: 30000,
    });
    const questions = await retryValidated(async (_attempt, error) => {
      const result = await client.chat.completions.create({
        model:
          process.env.GENERATOR_MODEL ||
          process.env.OPENAI_MODEL ||
          "deepseek-chat",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: RESUME_QUESTIONS_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              resume: text,
              roleTitle: interview?.roleTitle,
              title: interview?.title,
              objective: interview?.objective,
              existingQuestions: (interview?.questions || [])
                .filter((q: { candidateId?: string }) => !q.candidateId)
                .map((q: { text: string }) => q.text),
              validationFeedback: error || undefined,
            }),
          },
        ],
      });
      return validateResumeQuestions(
        JSON.parse(result.choices[0]?.message.content || "{}"),
        text,
        (interview?.questions || [])
          .filter((q: { candidateId?: string }) => !q.candidateId)
          .map((q: { text: string }) => q.text),
      );
    });
    const saved = await supabaseAdmin.rpc("save_resume_questions", {
      p_candidate_id: candidateId,
      p_text: text,
      p_filename: file.name.slice(0, 200),
      p_questions: questions,
    });
    if (saved.error)
      return Response.json({ error: saved.error.message }, { status: 409 });
    return Response.json(
      { questions, fileName: file.name },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "FORBIDDEN")
      return Response.json({ error: "没有权限配置该面试" }, { status: 403 });
    if (e instanceof z.ZodError)
      return Response.json({ error: "候选人信息无效" }, { status: 400 });
    return Response.json(
      { error: "简历解析或追问生成失败，请检查文件后重试" },
      { status: 502 },
    );
  }
}
