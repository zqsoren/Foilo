"use client";

import { useRouter } from "next/navigation";
import { confirmProjectAiChangeSetAction, rejectProjectAiChangeSetAction } from "@/app/actions";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";

export function AiChangePreviewActions({ changeSetId }: { changeSetId: number }) {
  const mutation = useMutation();
  const router = useRouter();
  return (
    <div>
      <InlineFeedback error={mutation.error} notice={mutation.notice} />
      <div className="ai-change-preview-actions">
        <button className="secondary-button" disabled={mutation.pending} onClick={async () => {
          const result = await mutation.run(() => rejectProjectAiChangeSetAction(changeSetId), "已拒绝这次修改");
          if (result.ok) router.push("/projects");
        }}>拒绝修改</button>
        <button className="primary-button" disabled={mutation.pending} onClick={async () => {
          const result = await mutation.run(() => confirmProjectAiChangeSetAction(changeSetId), "修改已执行");
          if (result.ok) router.push("/projects");
        }}>确认并执行</button>
      </div>
    </div>
  );
}

