import { WorkspaceRowBadge } from "@getpaseo/plugin/client/ui";
import { presentPrReview, usePrStatus } from "./use-pr-status";

export function PrWorkspaceRowBadge({ workspaceId }: { workspaceId: string }) {
  const status = usePrStatus(workspaceId);
  const presentation = status ? presentPrReview(status) : null;
  if (!presentation) return null;

  return (
    <WorkspaceRowBadge
      icon={presentation.icon}
      label={presentation.label}
      tone={presentation.tone}
      accessibilityLabel={`Pull request review: ${presentation.label}`}
    />
  );
}
