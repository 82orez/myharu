import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-muted/30 px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <Skeleton className="mb-2 h-7 w-24" />
        <Skeleton className="mb-6 h-4 w-48" />
        <Skeleton className="mb-4 h-10 w-full rounded-lg" />
        <Skeleton className="mb-4 h-10 w-full rounded-lg" />
        <Skeleton className="mb-4 h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </main>
  );
}
