"use client";

import { useState } from "react";
import TagManager from "@/components/learn/TagManager";

// 설정 페이지용 태그 관리 래퍼 — 프리셋 목록 state만 보유
export default function TagManagerCard({ initialPresets }: { initialPresets: string[] }) {
  const [presets, setPresets] = useState<string[]>(initialPresets);

  return <TagManager presets={presets} onPresetsChange={setPresets} />;
}
