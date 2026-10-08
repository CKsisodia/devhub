"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { MeContext } from "@/lib/hooks";
import type { Me } from "@/lib/types";
import { Logo } from "./Logo";

/** Client-side gate: no full session -> /login. All data access is still checked by the backend. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, error } = useSWR<Me>("/api/me", fetcher);

  useEffect(() => {
    const toLogin = () => router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (error) toLogin();
    window.addEventListener("devhub:unauthorised", toLogin);
    return () => window.removeEventListener("devhub:unauthorised", toLogin);
  }, [error, router, pathname]);

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
