import { Skeleton } from "@/components/ui/skeleton";

export default function GoalLoading() {
  return (
    <main className="bg-muted/30 flex min-h-[calc(100vh-200px)] items-center justify-center px-6 py-16">
      <div className="border-border bg-card w-full max-w-lg rounded-xl border p-6">
        <Skeleton className="mb-2 h-7 w-40" />
        <Skeleton className="mb-6 h-4 w-64" />
        <Skeleton className="mb-4 h-20 w-full rounded-lg" />
        <Skeleton className="mb-4 h-10 w-full rounded-lg" />
        <Skeleton className="mb-4 h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </main>
  );
}
