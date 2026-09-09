"use client";

import { useUiTranslation } from "@/hooks/use-ui-translation";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAppLocale } from "@/components/app-locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
export function ResumeQuestionPanel({ interviewId }: { interviewId: string }) {
  const ui = useUiTranslation();
  const { locale } = useAppLocale();
  const zh = locale === "zh";
  const candidates = trpc.candidate.list.useQuery({ interviewId });
  const interview = trpc.interview.getById.useQuery({ id: interviewId });
  const create = trpc.candidate.create.useMutation();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<
    { text: string; evidence: string }[]
  >([]);
  const savedQuestions = (interview.data?.questions || [])
    .filter(
      (q: { candidateId?: string }) => selected && q.candidateId === selected,
    )
    .map((q: { text: string; resumeEvidence?: string }) => ({
      text: q.text,
      evidence: q.resumeEvidence || "",
    }));
  const hasStarted = !!candidates.data?.candidates.find((c: {id:string;sessionId?:string|null}) => c.id===selected)?.sessionId;
  const displayedQuestions = questions.length ? questions : savedQuestions;
  async function generate() {
    if (!file || hasStarted) return;
    setBusy(true);
    setError("");
    try {
      let candidateId = selected;
      if (!candidateId) {
        const c = await create.mutateAsync({
          interviewId,
          name: name.trim(),
          phone: phone.trim(),
        });
        candidateId = c.id;
        setSelected(c.id);
        await candidates.refetch();
      }
      const form = new FormData();
      form.set("candidateId", candidateId);
      form.set("file", file);
      const response = await fetch("/api/ai/resume-questions", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setQuestions(result.questions);
      await utils.interview.getById.invalidate({ id: interviewId });
      await candidates.refetch();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : zh
            ? "生成失败，请重试"
            : "Generation failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-5"
      aria-labelledby="resume-heading"
    >
      <div>
        <h2 id="resume-heading" className="text-lg font-semibold">
          {zh ? "简历定向追问" : ui("Resume follow-up questions")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {zh
            ? "上传候选人简历，自动插入 2–3 道专属追问，仅用于该候选人的面试。请在候选人开始面试前配置。"
            : ui(
                "Upload a resume to add 2–3 questions for this candidate only, before their interview starts.",
              )}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="resume-candidate">
          {zh ? "候选人" : ui("Candidate")}
        </Label>
        <select
          id="resume-candidate"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setQuestions([]);
          }}
          disabled={busy}
        >
          <option value="">{zh ? "新建候选人" : ui("New candidate")}</option>
          {candidates.data?.candidates.map(
            (c: { id: string; name: string; phone?: string }) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.phone || (zh ? "未填写手机号" : ui("No phone"))}
              </option>
            ),
          )}
        </select>
      </div>
      {!selected && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="resume-name">{zh ? "姓名" : ui("Name")}</Label>
            <Input
              id="resume-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resume-phone">{zh ? "手机号" : ui("Phone")}</Label>
            <Input
              id="resume-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={64}
            />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="resume-file">
          {zh
            ? "简历文件（PDF / TXT / MD，不超过 5 MB）"
            : ui("Resume (PDF / TXT / MD, up to 5 MB)")}
        </Label>
        <Input
          id="resume-file"
          type="file"
          accept=".pdf,.txt,.md"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setQuestions([]);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {hasStarted && <p className="text-sm text-muted-foreground">{zh ? "该候选人已开始面试，专属题目已锁定，可继续查看。" : "This interview has started. Candidate questions are locked for review."}</p>}
      <Button
        type="button"
        disabled={
          hasStarted || busy || !file || (!selected && (!name.trim() || !phone.trim()))
        }
        onClick={generate}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {busy
          ? zh
            ? "正在解析并生成…"
            : "Generating…"
          : zh
            ? "解析并插入追问"
            : ui("Generate and insert questions")}
      </Button>
      {displayedQuestions.length > 0 && (
        <div role="status" className="space-y-3">
          <p className="font-medium">
            {zh
              ? `已保存 ${displayedQuestions.length} 道候选人专属追问`
              : `Saved ${displayedQuestions.length} candidate questions`}
          </p>
          {displayedQuestions.map(
            (q: { text: string; evidence: string }, i: number) => (
              <div key={i}>
                <p>
                  {i + 1}. {q.text}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {zh ? "简历依据：" : ui("Resume evidence: ")}
                  {q.evidence}
                </p>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
