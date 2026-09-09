import { z } from "zod";
export const resumeQuestionSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(8).max(600),
        rationale: z.string().trim().min(2).max(500),
        evidence: z.string().trim().min(4).max(1000),
      }),
    )
    .min(2)
    .max(3),
});
const compact = (s: string) => s.replace(/\s+/g, "");
export function validateResumeQuestions(
  value: unknown,
  resume: string,
  existingQuestions: string[] = [],
) {
  const result = resumeQuestionSchema.parse(value);
  if (
    new Set(result.questions.map((q) => compact(q.text))).size !==
    result.questions.length
  )
    throw new Error("追问题目重复");
  if (
    result.questions.some((q) =>
      existingQuestions.some(
        (existing) => compact(existing) === compact(q.text),
      ),
    )
  )
    throw new Error("追问与已有题目重复");
  if (
    result.questions.some((q) => !compact(resume).includes(compact(q.evidence)))
  )
    throw new Error("追问依据不在简历原文中");
  return result.questions;
}
export async function retryValidated<T>(
  work: (attempt: number, previousError: string) => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last = "";
  for (let n = 0; n < attempts; n++) {
    try {
      return await work(n, last);
    } catch (e) {
      last = e instanceof Error ? e.message : "生成失败";
      if (n === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 300 * (n + 1)));
    }
  }
  throw new Error(last);
}
