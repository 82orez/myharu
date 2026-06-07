import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewLoading() {
  return (
    <main className="mx-auto min-h-[calc(100vh-200px)] max-w-2xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  );
}
