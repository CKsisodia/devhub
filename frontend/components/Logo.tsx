import { Sparkles } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="bg-ai inline-flex size-7 items-center justify-center rounded-md text-white shadow-xs">
        <Sparkles className="size-4" strokeWidth={2} />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.01em]">
          FE Panel <span className="font-normal text-muted">· DevHub</span>
        </span>
      )}
    </span>
  );
}
