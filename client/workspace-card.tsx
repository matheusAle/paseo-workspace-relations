import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { openExternalUrl, useWorkspace, type WorkspaceRef } from "@getpaseo/plugin/client";
import { copyText, Icon } from "@getpaseo/plugin/client/ui";
import { useSidebar } from "./context";
import {
  checkCountsOf,
  pullRequestNumberOf,
  pullRequestOf,
  pullRequestStateOf,
  useWorkspaceDescriptor,
} from "./data";
import { shortenPath, type Palette } from "./look";
import { usePrStatus } from "./use-pr-status";
import { prColor } from "./workspace-meta";

function CardRow({ icon, iconColor, children, palette }: { icon: string; iconColor?: string; children: ReactNode; palette: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}>
      <Icon name={icon} size={12} color={iconColor ?? palette.muted} />
      {children}
    </View>
  );
}

function CardText({ children, color }: { children: ReactNode; color: string }) {
  return (
    <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color }}>
      {children}
    </Text>
  );
}

function CopyRow({ icon, value, copyValue, label, palette }: { icon: string; value: string; copyValue: string; label: string; palette: Palette }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const active = hovered || copied;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => {
        void copyText(copyValue);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}
    >
      <Icon name={copied ? "Check" : hovered ? "Copy" : icon} size={12} color={active ? palette.foreground : palette.muted} />
      <CardText color={active ? palette.foreground : palette.muted}>{value}</CardText>
    </Pressable>
  );
}

function ReviewRows({ workspaceId, mergeable, palette }: { workspaceId: string; mergeable: string | undefined; palette: Palette }) {
  const status = usePrStatus(workspaceId);
  const found = status?.found ? status : null;
  const conflicting = mergeable === "CONFLICTING" || found?.mergeable === "conflicting";
  const clean = mergeable === "MERGEABLE" || found?.mergeable === "mergeable";
  return (
    <>
      {found ? (
        <CardRow icon="UserCheck" palette={palette}>
          <CardText color={palette.muted}>
            {found.approvalsRequired === null
              ? `${found.approvalsGiven} approval${found.approvalsGiven === 1 ? "" : "s"}`
              : `${found.approvalsGiven}/${found.approvalsRequired} approvals`}
          </CardText>
        </CardRow>
      ) : null}
      {conflicting || clean ? (
        <CardRow icon={conflicting ? "TriangleAlert" : "GitMerge"} iconColor={conflicting ? palette.danger : palette.success} palette={palette}>
          <CardText color={conflicting ? palette.danger : palette.muted}>
            {conflicting ? "Merge conflicts" : "Mergeable"}
          </CardText>
        </CardRow>
      ) : null}
    </>
  );
}

const GITHUB_MARK =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";

/** Lucide dropped brand marks, so the forge glyph is inline SVG, filled with the given color. */
function ForgeIcon({ forge, color }: { forge: string | undefined; color: string }) {
  if ((forge ?? "github") !== "github") return <Icon name="GitPullRequest" size={12} color={color} />;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${color}" d="${GITHUB_MARK}"/></svg>`;
  return <Icon icon={{ svg }} size={12} color={color} />;
}

function ChecksFooter({ url, forge, counts, palette }: { url: string; forge: string | undefined; counts: ReturnType<typeof checkCountsOf>; palette: Palette }) {
  const [hovered, setHovered] = useState(false);
  const checksUrl = (forge ?? "github") === "github" ? `${url.replace(/\/$/, "")}/checks` : url;
  const pills = [
    { key: "success", icon: "CircleCheck", color: palette.success, count: counts.success },
    { key: "failure", icon: "CircleX", color: palette.danger, count: counts.failure },
    { key: "pending", icon: "CircleDot", color: palette.warning, count: counts.pending },
  ].filter((pill) => pill.count > 0);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Open checks"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => void openExternalUrl(checksUrl)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 28,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: palette.cardBorder,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        backgroundColor: hovered ? palette.pressed : "transparent",
      }}
    >
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
        {hovered ? (
          <Icon name="ExternalLink" size={12} color={palette.foreground} />
        ) : (
          <ForgeIcon forge={forge} color={palette.foreground} />
        )}
        <Text style={{ fontSize: 12, color: palette.muted }}>Checks</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {pills.map((pill) => (
          <View key={pill.key} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Icon name={pill.icon} size={12} color={pill.color} />
            <Text style={{ fontSize: 12, color: pill.color }}>{pill.count}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export function WorkspaceCard({ workspaceRef }: { workspaceRef: WorkspaceRef }) {
  const { palette, hostLabels } = useSidebar();
  const workspace = useWorkspace(workspaceRef);
  const descriptor = useWorkspaceDescriptor(workspaceRef);
  if (!workspace) return null;

  const pullRequest = pullRequestOf(descriptor);
  const prState = pullRequest ? pullRequestStateOf(pullRequest) : null;
  const prNumber = pullRequest ? pullRequestNumberOf(pullRequest) : null;
  const counts = checkCountsOf(pullRequest);
  const hasChecks = counts.success + counts.failure + counts.pending > 0;
  const directory = descriptor?.workspaceDirectory ?? workspace.directory;
  const hostLabel = hostLabels.get(workspace.hostId) ?? workspace.hostId;

  return (
    <View>
      <Text style={{ fontSize: 14, fontWeight: "600", color: palette.foreground, paddingHorizontal: 12, paddingBottom: 8 }}>
        {workspace.name}
      </Text>
      {pullRequest && prState && prNumber !== null ? (
        <CardRow icon={prState === "merged" ? "GitMerge" : prState === "draft" ? "GitPullRequestDraft" : prState === "closed" ? "GitPullRequestClosed" : "GitPullRequest"} iconColor={prColor(prState, palette)} palette={palette}>
          <CardText color={palette.muted}>
            {prNumber}
            {prState === "open" ? "" : ` ${prState[0].toUpperCase()}${prState.slice(1)}`}
          </CardText>
        </CardRow>
      ) : null}
      {pullRequest && (prState === "open" || prState === "draft") ? (
        <ReviewRows workspaceId={workspace.id} mergeable={pullRequest.mergeable} palette={palette} />
      ) : null}
      {workspace.diffStat ? (
        <CardRow icon="FileDiff" palette={palette}>
          <Text style={{ fontSize: 12, color: palette.success }}>+{workspace.diffStat.additions}</Text>
          <Text style={{ fontSize: 12, color: palette.danger }}>-{workspace.diffStat.deletions}</Text>
        </CardRow>
      ) : null}
      <CardRow icon="Server" palette={palette}>
        <CardText color={palette.muted}>{hostLabel}</CardText>
      </CardRow>
      {workspace.branch ? (
        <CopyRow icon="GitBranch" value={workspace.branch} copyValue={workspace.branch} label="Copy branch name" palette={palette} />
      ) : null}
      <CopyRow
        icon="Folder"
        value={descriptor?.worktreeSlug ?? shortenPath(directory)}
        copyValue={directory}
        label="Copy path"
        palette={palette}
      />
      {pullRequest && hasChecks ? (
        <ChecksFooter url={pullRequest.url} forge={descriptor?.forge} counts={counts} palette={palette} />
      ) : null}
    </View>
  );
}
