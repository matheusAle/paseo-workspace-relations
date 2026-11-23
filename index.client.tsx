import type { PluginClientContext } from "@getpaseo/plugin/client";
import { PrWorkspaceRowBadge } from "./client/pr-workspace-row-badge";
import { RelationsSidebarView } from "./client/sidebar-view";

export default function contribute(client: PluginClientContext) {
  const removeBadge = client.addWorkspaceRowBadgeItem({
    id: "pr-status",
    title: "Pull request",
    icon: "GitPullRequest",
    Component: ({ workspaceId }) => <PrWorkspaceRowBadge workspaceId={workspaceId} />,
  });
  const removeSidebarView = client.addSidebarView({
    id: "relations",
    title: "Relations",
    description: "Workspaces nested under the sub-agent that spawned them.",
    Component: RelationsSidebarView,
  });

  return () => {
    removeBadge();
    removeSidebarView();
  };
}
