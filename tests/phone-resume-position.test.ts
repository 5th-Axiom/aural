import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  phoneCredentials,
  phoneLoginInput,
  safeReturnPath,
} from "../src/lib/phone-auth";
import {
  validateResumeQuestions,
  retryValidated,
} from "../src/lib/resume-questions";
import { questionsForCandidate } from "../src/lib/session-question-scope";
import { INTERVIEW_TEMPLATES, getInterviewTemplates } from "../src/lib/interview-templates";
describe("mock phone authentication", () => {
  it("accepts arbitrary identifiers but only the fixed verification code", () => {
    assert.deepEqual(
      phoneLoginInput.parse({ phone: "  test-phone  ", code: "123456" }),
      { phone: "test-phone", code: "123456" },
    );
    for (const value of [
      { phone: "", code: "123456" },
      { phone: "123", code: "000000" },
    ])
      assert.equal(phoneLoginInput.safeParse(value).success, false);
  });
  it("creates a stable, distinct identity without disclosing the phone in synthetic email", () => {
    const secret = "s".repeat(32),
      a = phoneCredentials("13800000000", secret);
    assert.deepEqual(a, phoneCredentials("13800000000", secret));
    assert.notEqual(a.email, phoneCredentials("other", secret).email);
    assert.ok(!a.email.includes("13800000000"));
    assert.throws(() => phoneCredentials("x", "short"));
  });
  it("prevents external return redirects", () => {
    for (const url of [
      "https://bad.test",
      "//bad.test",
      "/\\bad.test",
      "/\nbad",
    ])
      assert.equal(safeReturnPath(url), "/dashboard");
    assert.equal(safeReturnPath("/i/demo"), "/i/demo");
  });
});
const resume =
  "负责电商系统订单服务，使用 Redis 缓存将接口延迟降低 30%，带领三人团队完成灰度发布。";
const questions = [
  {
    text: "请介绍订单服务缓存一致性如何保证？",
    rationale: "验证实际设计能力",
    evidence: "使用 Redis 缓存将接口延迟降低 30%",
  },
  {
    text: "在灰度发布过程中你如何安排三人团队的分工？",
    rationale: "了解个人贡献与协作",
    evidence: "带领三人团队完成灰度发布",
  },
];
describe("validated resume follow-ups", () => {
  it("accepts two or three questions grounded in the resume", () =>
    assert.equal(validateResumeQuestions({ questions }, resume).length, 2));
  it("rejects unsupported facts, duplicate and wrong question counts", () => {
    assert.throws(() =>
      validateResumeQuestions({ questions: [questions[0]] }, resume),
    );
    assert.throws(() =>
      validateResumeQuestions(
        { questions: [questions[0], questions[0]] },
        resume,
      ),
    );
    assert.throws(() =>
      validateResumeQuestions(
        {
          questions: [
            questions[0],
            { ...questions[1], evidence: "管理五十人团队" },
          ],
        },
        resume,
      ),
    );
    assert.throws(() =>
      validateResumeQuestions(
        { questions: [...questions, ...questions] },
        resume,
      ),
    );
  });
  it("retries failed validation with feedback and stops after success", async () => {
    const attempts: string[] = [];
    const result = await retryValidated(async (n, feedback) => {
      attempts.push(feedback);
      if (n === 0) throw Error("invalid evidence");
      return questions;
    });
    assert.equal(result.length, 2);
    assert.deepEqual(attempts, ["", "invalid evidence"]);
  });
  it("has a bounded retry budget", async () => {
    let n = 0;
    await assert.rejects(
      retryValidated(async () => {
        n++;
        throw Error("offline");
      }, 2),
      /offline/,
    );
    assert.equal(n, 2);
  });
});
describe("candidate question isolation and position", () => {
  it("keeps base questions first, excludes other candidates, and gives the voice engine sequential order", () => {
    const source = [
      { id: "b", order: 20 },
      { id: "a2", candidateId: "a", order: 2 },
      { id: "x", candidateId: "other", order: 0 },
      { id: "a1", candidateId: "a", order: 1 },
    ];
    const result = questionsForCandidate(source, "a");
    assert.deepEqual(
      result.map((q) => q.id),
      ["b", "a1", "a2"],
    );
    assert.deepEqual(
      result.map((q) => q.order),
      [0, 1, 2],
    );
    assert.deepEqual(
      questionsForCandidate(source).map((q) => q.id),
      ["b"],
    );
    assert.equal(source[0].order, 20);
  });
  it("assigns a position to every built-in template", () =>
    INTERVIEW_TEMPLATES.forEach((t) => assert.ok(t.roleTitle.trim())));
});

it("localizes template questions without changing their identifiers or types", () => {
 const zh=getInterviewTemplates("zh"),en=getInterviewTemplates("en");
 for(let i=0;i<zh.length;i++){
   assert.equal(zh[i].id,en[i].id);assert.match(zh[i].title,/[\u4e00-\u9fff]/);
   zh[i].questions.forEach((q,n)=>{assert.equal(q.type,en[i].questions[n].type);assert.match(q.text,/[\u4e00-\u9fff]/)});
 }
});
it("rejects a generated question that duplicates the base script",()=>assert.throws(()=>validateResumeQuestions({questions},resume,[questions[0].text])));
