import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewLoading() {
  return (
    <main className="mx-auto min-h-[calc(100vh-200px)] max-w-2xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-3 flex-1 rounded-full" />
          <Skeleton className="h-4 w-10" />
        </div>
        <Skeleton className="mx-auto h-[240px] w-full max-w-lg rounded-xl" />
        <div className="mx-auto flex w-full max-w-lg gap-3">
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="h-12 flex-1 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
