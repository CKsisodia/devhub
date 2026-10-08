"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BacklogView } from "@/components/BacklogView";
import { PageHeader } from "@/components/ui";

function Backlog() {
  const params = useSearchParams();
  const router = useRouter();
  const ai = params.get("ai");
  return (
    <BacklogView
      withAi
      initialAiPrompt={ai}
      onConsumedAiPrompt={() => router.replace("/backlog", { scroll: false })}
      headerSlot={(actions) => <PageHeader title="Backlog" subtitle="All frontend tasks across projects." actions={actions} />}
    />
  );
}

export default function BacklogPage() {
  return (
    <Suspense>
      <Backlog />
    </Suspense>
  );
}
