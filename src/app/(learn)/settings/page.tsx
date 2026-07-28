import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Mic, Target, ListChecks, Tag, AlertTriangle, Mail, Volume2 } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { fetchUserStats } from "@/lib/gamification";
import { getTagPresets } from "@/app/(learn)/learn/tag-actions";
import { logout } from "@/app/(auth)/logout/actions";
import { DAILY_PRACTICE_GOAL } from "@/lib/settings-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SpeechStrictField from "@/components/settings/SpeechStrictField";
import FeedbackSoundField from "@/components/settings/FeedbackSoundField";
import TagManagerCard from "@/components/settings/TagManagerCard";
import DeleteAllSentences from "@/components/settings/DeleteAllSentences";

export const metadata: Metadata = {
  title: "설정",
  robots: { index: false },
};

// 라벨·설명(왼쪽) / 컨트롤(오른쪽) 한 줄
function Row({ icon, label, description, children }: { icon: React.ReactNode; label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-start gap-2">
        <span className="text-brand mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [stats, { count }, presets, { data: tagRows }] = await Promise.all([
    fetchUserStats(supabase, user.id),
    supabase.from("sentences").select("*", { count: "exact", head: true }),
    getTagPresets(),
    supabase.from("sentences").select("tags").eq("user_id", user.id),
  ]);
  const sentenceCount = count ?? 0;

  // 태그별 사용 문장 수(삭제 시 영향 범위 표시용)
  const tagCounts: Record<string, number> = {};
  for (const row of tagRows ?? []) {
    for (const tag of row.tags ?? []) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">설정</h1>

      {/* 계정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">계정</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row icon={<Mail size={16} />} label="이메일">
            <span className="text-muted-foreground max-w-[55%] truncate text-sm">{user.email}</span>
          </Row>
          <Row icon={<ListChecks size={16} />} label="로그아웃" description="이 기기에서 로그아웃합니다.">
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                로그아웃
              </Button>
            </form>
          </Row>
        </CardContent>
      </Card>

      {/* 학습 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">학습</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row icon={<Mic size={16} />} label="스피킹 채점 난이도" description="말하기 정답 인정 기준 (쓰기는 항상 보통 기준)">
            <SpeechStrictField initialStrict={stats?.speech_strict ?? false} />
          </Row>
          <Row icon={<Volume2 size={16} />} label="효과음" description="정답·오답 알림음 (이 기기에만 적용)">
            <FeedbackSoundField />
          </Row>
          <Row icon={<Target size={16} />} label="하루 목표" description="고정값이며 변경할 수 없습니다.">
            <span className="text-sm font-semibold tabular-nums">연습 {DAILY_PRACTICE_GOAL.toLocaleString()}회</span>
          </Row>
          <Row icon={<ListChecks size={16} />} label="등록된 문장" description="지금까지 저장한 문장 수">
            <span className="text-sm font-semibold tabular-nums">{sentenceCount.toLocaleString()}개</span>
          </Row>
        </CardContent>
      </Card>

      {/* 태그 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag size={16} className="text-brand" />
            태그 관리
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-muted-foreground mb-3 text-sm">
            문장에 붙일 태그를 추가·수정·삭제합니다. 이름을 바꾸면 해당 태그를 가진 문장에 모두 반영됩니다.
          </p>
          <TagManagerCard initialPresets={presets} counts={tagCounts} />
        </CardContent>
      </Card>

      {/* 데이터 관리 */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2 text-base">
            <AlertTriangle size={16} />
            데이터 관리
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            icon={<AlertTriangle size={16} className="text-destructive" />}
            label="등록된 문장 전체 삭제"
            description="문장·음성 파일과 연습 기록이 모두 삭제되며 되돌릴 수 없습니다."
          >
            <DeleteAllSentences sentenceCount={sentenceCount} />
          </Row>
        </CardContent>
      </Card>
    </main>
  );
}
