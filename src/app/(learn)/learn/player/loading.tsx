import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerLoading() {
  return (
    <main className="bg-muted/30 min-h-[calc(100vh-200px)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <Skeleton className="mb-2 h-8 w-40" />
        <Skeleton className="mb-8 h-4 w-96 max-w-full" />
        <Skeleton className="mb-4 h-28 w-full rounded-3xl" />
        <Skeleton className="mb-4 h-40 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
      </div>
    </main>
  );
}
