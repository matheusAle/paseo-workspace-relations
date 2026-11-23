import { Fragment, useState, type ReactNode } from "react";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import type { PaseoWorkspace } from "@getpaseo/client";
import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { openExternalUrl } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PrStatusEvent } from "../shared/pr-status";
import { useSidebar } from "./context";
import {
  checksStateOf,
  primaryServiceOf,
  pullRequestNumberOf,
  pullRequestOf,
  pullRequestStateOf,
  type PullRequestState,
} from "./data";
import type { Palette } from "./look";
import { usePrStatus } from "./use-pr-status";

interface MetaPart {
  key: string;
  node: ReactNode;
}

function Glyph({ icon, color, text, textColor }: { icon: string; color: string; text?: string; textColor?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, minWidth: 0 }}>
      <Icon name={icon} size={12} color={color} />
      {text ? (
        <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: textColor ?? color }}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

const PR_ICON: Record<PullRequestState, string> = {
  draft: "GitPullRequestDraft",
  open: "GitPullRequest",
  merged: "GitMerge",
  closed: "GitPullRequestClosed",
};

const PR_SUFFIX: Record<PullRequestState, string> = {
  draft: " Draft",
  open: "",
  merged: " Merged",
  closed: " Closed",
};

export function prColor(state: PullRequestState, palette: Palette): string {
  if (state === "open") return palette.success;
  if (state === "merged") return palette.merged;
  if (state === "closed") return palette.danger;
  return palette.muted;
}

function PrItem({ url, number, state, palette }: { url: string; number: number; state: PullRequestState; palette: Palette }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open pull request ${number}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={(event: GestureResponderEvent) => event.stopPropagation()}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        void openExternalUrl(url);
      }}
    >
      <Glyph
        icon={hovered ? "ExternalLink" : PR_ICON[state]}
        color={hovered ? palette.foreground : prColor(state, palette)}
        text={`${number}${PR_SUFFIX[state]}`}
        textColor={hovered ? palette.foreground : palette.muted}
      />
    </Pressable>
  );
}

/** Review facts the app's row doesn't show: approvals from the forge, and merge conflicts. */
export function reviewParts(
  status: PrStatusEvent | null,
  mergeable: string | undefined,
  palette: Palette,
): MetaPart[] {
  const parts: MetaPart[] = [];
  if (status?.found && status.approvalsGiven + (status.approvalsRequired ?? 0) > 0) {
    const enough =
      status.approvalsRequired === null
        ? status.approvalsGiven > 0
        : status.approvalsGiven >= status.approvalsRequired;
    const text =
      status.approvalsRequired === null
        ? String(status.approvalsGiven)
        : `${status.approvalsGiven}/${status.approvalsRequired}`;
    parts.push({
      key: "approvals",
      node: <Glyph icon="UserCheck" color={enough ? palette.success : palette.muted} text={text} textColor={palette.muted} />,
    });
  }
  const conflicting = mergeable === "CONFLICTING" || (status?.found && status.mergeable === "conflicting");
  if (conflicting) {
    parts.push({ key: "conflicts", node: <Glyph icon="TriangleAlert" color={palette.danger} text="conflicts" /> });
  }
  return parts;
}

function MetaRow({ parts, palette }: { parts: MetaPart[]; palette: Palette }) {
  if (parts.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 6, rowGap: 2 }}>
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 ? <Text style={{ fontSize: 12, lineHeight: 16, color: palette.extraMuted }}>·</Text> : null}
          {part.node}
        </Fragment>
      ))}
    </View>
  );
}

function MetaRowWithReview({
  workspaceId,
  head,
  tail,
  mergeable,
  palette,
}: {
  workspaceId: string;
  head: MetaPart[];
  tail: MetaPart[];
  mergeable: string | undefined;
  palette: Palette;
}) {
  const status = usePrStatus(workspaceId);
  return <MetaRow parts={[...head, ...reviewParts(status, mergeable, palette), ...tail]} palette={palette} />;
}

export function WorkspaceMeta({
  workspace,
  descriptor,
  hostLabel,
  hiddenChildren,
}: {
  workspace: PluginWorkspaceSnapshot;
  descriptor: PaseoWorkspace | null;
  hostLabel: string | null;
  hiddenChildren: number;
}) {
  const { palette, settings, multiHost } = useSidebar();
  const head: MetaPart[] = [];
  const tail: MetaPart[] = [];

  if (settings.show.branch && workspace.branch) {
    head.push({ key: "branch", node: <Glyph icon="GitBranch" color={palette.muted} text={workspace.branch} /> });
  }
  if (settings.show.project) {
    head.push({ key: "project", node: <Glyph icon="Folder" color={palette.muted} text={workspace.projectDisplayName} /> });
  }
  if (settings.show.host && multiHost && hostLabel) {
    head.push({ key: "host", node: <Glyph icon="Server" color={palette.muted} text={hostLabel} /> });
  }

  const pullRequest = pullRequestOf(descriptor);
  const prState = pullRequest ? pullRequestStateOf(pullRequest) : null;
  const prNumber = pullRequest ? pullRequestNumberOf(pullRequest) : null;
  if (settings.show.pullRequest && pullRequest && prState && prNumber !== null) {
    head.push({
      key: "pr",
      node: <PrItem url={pullRequest.url} number={prNumber} state={prState} palette={palette} />,
    });
  }

  const checks = checksStateOf(pullRequest);
  if (settings.checks !== "hidden" && checks !== "none") {
    const icon = checks === "passed" ? "CircleCheck" : checks === "failed" ? "CircleX" : "CircleDashed";
    const color = checks === "passed" ? palette.success : checks === "failed" ? palette.danger : palette.warning;
    tail.push({
      key: "checks",
      node: <Glyph icon={icon} color={color} text={settings.checks === "iconAndText" ? checks : undefined} />,
    });
  }

  const service = primaryServiceOf(descriptor);
  if (settings.show.services && service) {
    const color = service.healthy ? palette.success : palette.danger;
    tail.push({ key: "service", node: <Glyph icon="Globe" color={color} text={service.name} /> });
  }

  if (settings.show.labels) {
    for (const label of workspace.labels) {
      tail.push({
        key: `label:${label}`,
        node: (
          <View style={{ paddingHorizontal: 5, borderRadius: 4, backgroundColor: palette.selected }}>
            <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 16, color: palette.muted }}>
              {label}
            </Text>
          </View>
        ),
      });
    }
  }

  if (hiddenChildren > 0) {
    tail.push({
      key: "children",
      node: (
        <Glyph
          icon="ListTree"
          color={palette.muted}
          text={`${hiddenChildren} sub-agent${hiddenChildren === 1 ? "" : "s"}`}
        />
      ),
    });
  }

  if (prState === "open" || prState === "draft") {
    return (
      <MetaRowWithReview
        workspaceId={workspace.id}
        head={head}
        tail={tail}
        mergeable={pullRequest?.mergeable}
        palette={palette}
      />
    );
  }
  return <MetaRow parts={[...head, ...tail]} palette={palette} />;
}
