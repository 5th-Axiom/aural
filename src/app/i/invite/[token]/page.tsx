"use client";

import { useUiTranslation } from "@/hooks/use-ui-translation";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Link2Off } from "lucide-react";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { SessionEndedScreen } from "@/components/session/session-ended-screen";

export default function InvitePage() {
  const ui = useUiTranslation();
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const [phoneReady, setPhoneReady] = useState(false);
  useEffect(() => {
    fetch("/api/auth/phone")
      .then((r) => r.json())
      .then((d) => {
        if (!d.phone)
          router.replace(
            `/login?next=${encodeURIComponent(`/i/invite/${token}`)}`,
          );
        else setPhoneReady(true);
      })
      .catch(() =>
        router.replace(
          `/login?next=${encodeURIComponent(`/i/invite/${token}`)}`,
        ),
      );
  }, [router, token]);
  const [completed, setCompleted] = useState(false);
  const sessionCreationAttempted = useRef(false);

  const candidate = trpc.candidate.getByToken.useQuery(
    { token },
    { retry: false },
  );

  const createSession = trpc.session.createFromInvite.useMutation({
    onSuccess: () => {
      goToSession();
    },
  });

  const sessionPath = `/i/invite/${token}/session`;

  useEffect(() => {
    router.prefetch(sessionPath);
  }, [router, sessionPath]);

  const goToSession = useCallback(() => {
    router.push(sessionPath);
  }, [router, sessionPath]);

  useEffect(() => {
    if (!phoneReady || !candidate.data || completed) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (candidate.data as any).session;
    if (session) {
      if (session.status === "COMPLETED") {
        setCompleted(true);
      } else {
        goToSession();
      }
      return;
    }

    if (!sessionCreationAttempted.current) {
      sessionCreationAttempted.current = true;
      createSession.mutate({ inviteToken: token });
    }
  }, [
    phoneReady,
    candidate.data,
    completed,
    createSession,
    token,
    goToSession,
  ]);

  // Loading
  if (candidate.isLoading) {
    return <PreparingScreen />;
  }

  // Error / invalid token
  if (candidate.isError || !candidate.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Link2Off className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">
              {ui("Invalid Invite Link")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {ui(
                "This invite link is invalid or the interview is no longer available.",
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Completed
  if (completed) {
    return <SessionEndedScreen />;
  }

  if (createSession.isError)
    return (
      <div className="mx-auto max-w-md p-8 space-y-4">
        <h1>无法开始面试</h1>
        <p>{createSession.error.message}</p>
        <button onClick={() => createSession.mutate({ inviteToken: token })}>
          重试
        </button>
        <a
          className="block underline"
          href={`/login?next=${encodeURIComponent(`/i/invite/${token}`)}`}
        >
          切换手机号
        </a>
      </div>
    );

  // Creating session
  return <PreparingScreen />;
}
