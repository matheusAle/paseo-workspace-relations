import { useState } from "react";
import { useSubscription } from "@getpaseo/plugin/client";
import type { WorkspaceRowBadgeTone } from "@getpaseo/plugin/client/ui";
import { prStatusWatch, type PrStatusEvent } from "../shared/pr-status";

export function usePrStatus(workspaceId: string): PrStatusEvent | null {
  const [status, setStatus] = useState<PrStatusEvent | null>(null);
  useSubscription(prStatusWatch, { workspaceId }, setStatus);
  return status;
}

export interface PrReviewPresentation {
  readonly label: string;
  readonly icon: string;
  readonly tone: WorkspaceRowBadgeTone;
}

/**
 * What an open pull request's row in the default sidebar is missing: whether it is a draft, its
 * approvals, and merge conflicts. The app's own row already shows the number and state.
 */
export function presentPrReview(status: PrStatusEvent): PrReviewPresentation | null {
  if (!status.found || status.state === "merged" || status.state === "closed") return null;

  const conflict = status.mergeable === "conflicting";
  const hasApprovals = status.approvalsGiven > 0 || status.approvalsRequired !== null;
  const approved =
    status.approvalsRequired === null
      ? status.approvalsGiven > 0
      : status.approvalsGiven >= status.approvalsRequired;
  const approvals = !hasApprovals
    ? null
    : status.approvalsRequired === null
      ? `${status.approvalsGiven} approved`
      : `${status.approvalsGiven}/${status.approvalsRequired} approved`;
  const parts = [status.state === "draft" ? "Draft" : null, approvals, conflict ? "conflicts" : null].filter(
    (part): part is string => part !== null,
  );
  if (parts.length === 0) return null;

  let icon = "UserCheck";
  if (conflict) icon = "TriangleAlert";
  else if (status.state === "draft" && !approved) icon = "GitPullRequestDraft";

  let tone: WorkspaceRowBadgeTone = "muted";
  if (conflict) tone = "danger";
  else if (approved) tone = "success";

  return { label: parts.join(" · "), icon, tone };
}
