"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

export function useMutation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(
    <T extends object>(action: () => Promise<ActionResult<T>>, success?: string) =>
      new Promise<ActionResult<T>>((resolve) => {
        setError(null);
        setNotice(null);
        startTransition(async () => {
          const result = await action();
          if (result.ok) {
            if (success) setNotice(success);
            router.refresh();
          } else {
            setError(result.message);
          }
          resolve(result);
        });
      }),
    [router],
  );

  return { pending, error, notice, setError, run };
}

export function InlineFeedback({
  error,
  notice,
}: {
  error: string | null;
  notice?: string | null;
}) {
  if (error) return <p className="feedback feedback-error">{error}</p>;
  if (notice) return <p className="feedback feedback-success">{notice}</p>;
  return null;
}

