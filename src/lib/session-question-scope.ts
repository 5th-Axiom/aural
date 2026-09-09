export function questionsForCandidate<
  T extends { candidateId?: string | null; order?: number },
>(questions: T[], candidateId?: string | null): T[] {
  return questions
    .filter(
      (q) => !q.candidateId || (!!candidateId && q.candidateId === candidateId),
    )
    .sort(
      (a, b) =>
        Number(!!a.candidateId) - Number(!!b.candidateId) ||
        (a.order || 0) - (b.order || 0),
    )
    .map((q, order) => ({ ...q, order }));
}
