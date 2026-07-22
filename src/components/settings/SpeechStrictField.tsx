"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSpeechStrict } from "@/app/(learn)/settings/actions";
import { Button } from "@/components/ui/button";

// 스피킹 채점 난이도 — 버튼 클릭 즉시 저장
export default function SpeechStrictField({ initialStrict }: { initialStrict: boolean }) {
  const [strict, setStrict] = useState(initialStrict);
  const [saving, startSaving] = useTransition();

  function save(next: boolean) {
    if (next === strict) return;
    const prev = strict;
    setStrict(next);
    startSaving(async () => {
      const result = await setSpeechStrict(next);
      if ("error" in result) {
        setStrict(prev);
        toast.error(result.error);
        return;
      }
      toast.success("저장되었습니다.");
    });
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button variant={strict ? "outline" : "brand"} size="sm" disabled={saving} onClick={() => save(false)}>
        보통 (80%)
      </Button>
      <Button variant={strict ? "brand" : "outline"} size="sm" disabled={saving} onClick={() => save(true)}>
        엄격 (90%)
      </Button>
    </div>
  );
}
