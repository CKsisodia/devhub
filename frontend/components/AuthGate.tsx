"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Session from "supertokens-web-js/recipe/session";
import { fetcher } from "@/lib/api";
import { MeContext } from "@/lib/hooks";
import type { Me } from "@/lib/types";
import { Logo } from "./Logo";

/** Client-side gate: no session -> /login. All data access is still checked by the backend. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    Session.doesSessionExist().then((exists) => {
      setHasSession(exists);
      if (!exists) router.replace("/login");
    });
  }, [router]);
  const { data: me, error } = useSWR<Me>(hasSession ? "/api/me" : null, fetcher);

  useEffect(() => {
    if (error) Session.signOut().finally(() => router.replace("/login"));
  }, [error, router]);

  useEffect(() => {
    const onUnauthorised = () => Session.signOut().finally(() => router.replace("/login"));
    window.addEventListener("devhub:unauthorised", onUnauthorised);
    return () => window.removeEventListener("devhub:unauthorised", onUnauthorised);
  }, [router]);

  if (!me) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex animate-pulse flex-col items-center gap-3 text-sm text-muted">
          <Logo />
          Loading…
        </div>
      </div>
    );
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}
