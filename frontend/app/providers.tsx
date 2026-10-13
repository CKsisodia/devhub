"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { ToastProvider } from "@/components/toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="devhub.theme" disableTransitionOnChange>
      <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false }}>
        <MotionConfig reducedMotion="user">
          <ToastProvider>{children}</ToastProvider>
        </MotionConfig>
      </SWRConfig>
    </ThemeProvider>
  );
}
