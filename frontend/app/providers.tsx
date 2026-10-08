"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false }}>
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  );
}
