-- Preserve historical email records while new logins and sessions use phone identifiers.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS "roleTitle" text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS "candidateId" uuid REFERENCES public.candidates(id) ON DELETE SET NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS "participantUserId" uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS "resumeText" text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS "resumeFileName" text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS "candidateId" uuid REFERENCES public.candidates(id) ON DELETE CASCADE;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS "resumeEvidence" text;
UPDATE public.sessions s SET "roleTitle" = i."roleTitle" FROM public.interviews i WHERE i.id=s."interviewId" AND s."roleTitle" IS NULL;
CREATE INDEX IF NOT EXISTS idx_interviews_role_title ON public.interviews ("roleTitle");
CREATE INDEX IF NOT EXISTS idx_sessions_role_title ON public.sessions ("roleTitle");
CREATE INDEX IF NOT EXISTS idx_candidates_phone ON public.candidates ("interviewId",phone);
CREATE INDEX IF NOT EXISTS idx_questions_candidate ON public.questions ("candidateId");
-- Restrictive policy intersects the existing base SELECT policy; personal questions are never public.
DROP POLICY IF EXISTS "Personal resume questions stay with candidate or interviewer" ON public.questions;
CREATE POLICY "Personal resume questions stay with candidate or interviewer" ON public.questions AS RESTRICTIVE FOR SELECT USING (
  "candidateId" IS NULL OR EXISTS (SELECT 1 FROM public.interviews i WHERE i.id="interviewId" AND i."userId"=auth.uid())
  OR EXISTS (SELECT 1 FROM public.candidates c WHERE c.id="candidateId" AND c.phone=(auth.jwt()->'app_metadata'->>'phone'))
);
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.start_phone_interview(p_interview_id uuid, p_phone text, p_user_id uuid, p_name text DEFAULT NULL, p_invite_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i interviews; c candidates; s sessions; first_question uuid;
BEGIN
  IF p_phone IS NULL OR length(trim(p_phone))=0 OR p_user_id IS NULL THEN RAISE EXCEPTION '请先使用手机号登录'; END IF;
  SELECT * INTO i FROM interviews WHERE id=p_interview_id AND "isActive" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION '面试不存在或已关闭'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_interview_id::text||':'||p_phone,0));
  IF p_invite_token IS NOT NULL THEN
    SELECT * INTO c FROM candidates WHERE "interviewId"=i.id AND "inviteToken"=p_invite_token FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '邀请链接无效'; END IF;
    IF c.phone IS NOT NULL AND trim(c.phone)<>'' AND c.phone<>p_phone THEN RAISE EXCEPTION '请使用受邀手机号登录'; END IF;
  ELSE
    SELECT * INTO c FROM candidates WHERE "interviewId"=i.id AND phone=p_phone ORDER BY "createdAt" LIMIT 1 FOR UPDATE;
    IF NOT FOUND AND i."requireInvite" THEN RAISE EXCEPTION '该手机号不在邀请名单中'; END IF;
    IF c.id IS NULL THEN
      INSERT INTO candidates ("interviewId",name,phone,"inviteToken") VALUES (i.id,coalesce(nullif(p_name,''),p_phone),p_phone,gen_random_uuid()::text) RETURNING * INTO c;
    END IF;
  END IF;
  UPDATE candidates SET phone=p_phone WHERE id=c.id;
  IF p_invite_token IS NOT NULL AND c."sessionId" IS NOT NULL THEN
    SELECT * INTO s FROM sessions WHERE id=c."sessionId";
    IF FOUND THEN
      UPDATE sessions SET "participantPhone"=p_phone,"participantUserId"=p_user_id,"candidateId"=c.id,"roleTitle"=coalesce("roleTitle",i."roleTitle") WHERE id=s.id RETURNING * INTO s;
      RETURN to_jsonb(s);
    END IF;
  END IF;
  SELECT id INTO first_question FROM questions WHERE "interviewId"=i.id AND ("candidateId" IS NULL OR "candidateId"=c.id) ORDER BY ("candidateId" IS NOT NULL),"order",id LIMIT 1;
  INSERT INTO sessions ("interviewId","participantName","participantPhone","participantUserId","candidateId","roleTitle","modeUsed","currentQuestionId")
  VALUES (i.id,coalesce(nullif(p_name,''),c.name),p_phone,p_user_id,c.id,i."roleTitle",CASE WHEN i."voiceEnabled" THEN 'VOICE'::"InterviewMode" ELSE 'CHAT'::"InterviewMode" END,first_question) RETURNING * INTO s;
  UPDATE candidates SET "sessionId"=s.id WHERE id=c.id;
  RETURN to_jsonb(s);
END; $$;
REVOKE ALL ON FUNCTION public.start_phone_interview(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_phone_interview(uuid,text,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.save_resume_questions(p_candidate_id uuid,p_text text,p_filename text,p_questions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c candidates; q jsonb; n integer;
BEGIN
 SELECT * INTO c FROM candidates WHERE id=p_candidate_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '候选人不存在'; END IF;
 IF jsonb_array_length(p_questions) NOT BETWEEN 2 AND 3 THEN RAISE EXCEPTION '需要 2–3 道追问'; END IF;
 IF c."sessionId" IS NOT NULL OR EXISTS (SELECT 1 FROM sessions WHERE "candidateId"=c.id) THEN RAISE EXCEPTION '候选人已开始面试，不能替换专属问题'; END IF;
 SELECT coalesce(max("order"),-1)+1 INTO n FROM questions WHERE "interviewId"=c."interviewId" AND "candidateId" IS NULL;
 DELETE FROM questions WHERE "candidateId"=c.id;
 FOR q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
   INSERT INTO questions ("interviewId","candidateId",text,description,"resumeEvidence",type,"order","isRequired","probeOnShort")
   VALUES(c."interviewId",c.id,q->>'text',q->>'rationale',q->>'evidence','OPEN_ENDED',n,true,true);
   n:=n+1;
 END LOOP;
 UPDATE candidates SET "resumeText"=p_text,"resumeFileName"=p_filename WHERE id=c.id;
END; $$;
REVOKE ALL ON FUNCTION public.save_resume_questions(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_resume_questions(uuid,text,text,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';

-- Legacy entry points remain available only to the server (e.g. admin previews).
REVOKE ALL ON FUNCTION public.create_interview_session(uuid,text,text,"InterviewMode",uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_invite_session(text,"InterviewMode",uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_interview_session(uuid,text,text,"InterviewMode",uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_invite_session(text,"InterviewMode",uuid) TO service_role;
