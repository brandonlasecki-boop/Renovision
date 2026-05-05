"use client";

import { useRouter } from "next/navigation";

export function StartNewTryLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="font-medium text-renovision-navy underline-offset-4 hover:underline"
      onClick={() => {
        router.push(`/upload?r=${Date.now()}`);
      }}
    >
      Start New
    </button>
  );
}
