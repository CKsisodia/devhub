"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { initSuperTokens } from "@/lib/supertokens";
import { ToastProvider } from "@/components/toast";

// Initialise on module load in the browser so the fetch interceptor is in place before any request.
initSuperTokens();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false }}>
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  );
}
