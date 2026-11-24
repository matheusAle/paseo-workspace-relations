import { useEffect, useRef, useState } from "react";
import { useRpc, useSettings, useSubscription } from "@getpaseo/plugin/client";
import type { WorkspaceRowBadgeTone } from "@getpaseo/plugin/client/ui";
import { prStatusRefresh, prStatusWatch, type PrStatusEvent } from "../shared/pr-status";
import { DEFAULT_SIDEBAR_SETTINGS, sidebarSettings } from "../shared/settings";

/**
 * A workspace's review status from the forge. The daemon fetches it once per workspace however
 * many rows watch it, at the refresh interval set in the display menu. `changeKey` summarizes
 * Paseo's own pull request state for the workspace; when it changes (a push, a review, a merge),
 * the forge is asked again instead of waiting for the next interval.
 */
export function usePrStatus(workspaceId: string, changeKey?: string | null): PrStatusEvent | null {
  const [status, setStatus] = useState<PrStatusEvent | null>(null);
  const settings = useSettings(sidebarSettings);
  const intervalSeconds =
    settings.status === "ready" ? settings.values.prRefreshSeconds : DEFAULT_SIDEBAR_SETTINGS.prRefreshSeconds;
  useSubscription(prStatusWatch, { workspaceId, intervalSeconds }, setStatus);

  const refresh = useRpc(prStatusRefresh);
  const seen = useRef(changeKey);
  useEffect(() => {
    if (changeKey === undefined || changeKey === seen.current) return;
    const first = seen.current === undefined || seen.current === null;
    seen.current = changeKey;
    // The first value is what the subscription already fetched against.
    if (first) return;
    void refresh({ workspaceIds: [workspaceId], force: false }).catch(() => {});
  }, [changeKey, workspaceId, refresh]);

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
