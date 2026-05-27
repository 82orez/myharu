import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand" />
    </main>
  );
}
