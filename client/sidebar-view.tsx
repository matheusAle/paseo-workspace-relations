import { useCallback, useMemo, useRef, useState } from "react";
import { View, type ViewStyle } from "react-native";
import type { PluginWorkspaceSnapshot, WorkspaceIndicator } from "@getpaseo/plugin";
import {
  useHosts,
  useProjects,
  useSettings,
  useWorkspaces,
  type PluginSidebarViewProps,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { applySavedOrder, reorderWithin } from "../shared/order";
import { buildForest, someInTree, type RelationNode } from "../shared/relations";
import { DEFAULT_SIDEBAR_SETTINGS, sidebarSettings, type SidebarSettings } from "../shared/settings";
import { useImportAppOrder } from "./app-order";
import { SidebarContext, useSidebar, type SidebarContextValue } from "./context";
import { projectKeyId, useParentWorkspaces, useProjectKeys } from "./data";
import { DisplayMenu } from "./display-menu";
import { mostUrgent } from "./glyphs";
import { LayerHost, useLayer } from "./layer";
import { paletteFor } from "./look";
import {
  DisplayButton,
  EmptyProjectRow,
  ProjectHeader,
  SectionHeader,
  ShowMoreRow,
  STATUS_GROUPS,
  StatusHeader,
} from "./sections";
import { DragScopeContext, SortableList } from "./sortable";
import { INDENT, ROW_GLYPH_CENTER, WorkspaceRow } from "./workspace-row";

const SHOW_MORE_LIMIT = 7;
const PINNED_LIMIT = 20;

function timeOf(iso: string | null | undefined): number {
  const time = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

/**
 * The app's "Show more" rule: the first few roots always show, and so does any root whose subtree
 * is still working or holds the open workspace.
 */
function visibleRoots(
  roots: readonly RelationNode[],
  options: { limit: number; expanded: boolean; isPending: (key: string) => boolean; selectedKey: string | null },
): { visible: RelationNode[]; canToggle: boolean } {
  const visible = roots.filter(
    (node, index) =>
      index < options.limit ||
      options.expanded ||
      someInTree(node, (key) => options.isPending(key) || key === options.selectedKey),
  );
  return { visible, canToggle: roots.length > options.limit };
}

function useFilter(settings: SidebarSettings): (workspace: PluginWorkspaceSnapshot) => boolean {
  return (workspace) =>
    !workspace.archivingAt &&
    (settings.showBackground || !workspace.background) &&
    (settings.hostFilter.length === 0 || settings.hostFilter.includes(workspace.hostId)) &&
    (settings.projectFilter.length === 0 || settings.projectFilter.includes(workspace.project.key)) &&
    (settings.labelFilter.length === 0 || workspace.labels.some((label) => settings.labelFilter.includes(label)));
}

interface TreeOptions {
  readonly refs: ReadonlyMap<string, WorkspaceRef>;
  readonly leading: "status" | "project";
  readonly collapsedKeys: ReadonlySet<string>;
  readonly toggleCollapsed: (key: string) => void;
  /** Saves a sibling list's new order; absent where the list isn't manually sorted. */
  readonly onReorder: ((siblings: string[]) => void) | null;
}

/** A list of sibling workspaces, each followed by its own sub-agent workspaces. */
function WorkspaceTree({ nodes, depth, options }: { nodes: readonly RelationNode[]; depth: number; options: TreeOptions }) {
  const byKey = new Map(nodes.map((node) => [node.key, node] as const));
  return (
    <SortableList
      ids={nodes.map((node) => node.key)}
      enabled={options.onReorder !== null}
      onReorder={(next) => options.onReorder?.(next)}
      renderItem={(key) => {
        const node = byKey.get(key);
        const last = nodes[nodes.length - 1]?.key === key;
        return node ? <WorkspaceNode node={node} depth={depth} last={last} options={options} /> : null;
      }}
    />
  );
}

/**
 * The guide joining a sub-agent workspace to its parent: a line down the whole subtree while more
 * siblings follow, and an "└" ending at the status glyph on the last one.
 */
function RelationGuide({ depth, last }: { depth: number; last: boolean }) {
  const { palette } = useSidebar();
  const left = depth * INDENT;
  return last ? (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left,
        top: 0,
        width: 6,
        height: ROW_GLYPH_CENTER,
        borderLeftWidth: 1,
        borderBottomWidth: 1,
        borderBottomLeftRadius: 4,
        borderColor: palette.border,
      }}
    />
  ) : (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left, top: 0, bottom: 0, width: 1, backgroundColor: palette.border }}
    />
  );
}

/** The parent's glyph sits on its children's guide line, so the stem starts just below it. */
function ParentStem({ depth }: { depth: number }) {
  const { palette } = useSidebar();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (depth + 1) * INDENT,
        top: ROW_GLYPH_CENTER + 8,
        bottom: 0,
        width: 1,
        backgroundColor: palette.border,
      }}
    />
  );
}

function WorkspaceNode({
  node,
  depth,
  last,
  options,
}: {
  node: RelationNode;
  depth: number;
  last: boolean;
  options: TreeOptions;
}) {
  const ref = options.refs.get(node.key);
  if (!ref) return null;
  const relationKey = `relation:${node.key}`;
  const collapsed = options.collapsedKeys.has(relationKey);
  const hasChildren = node.children.length > 0;
  return (
    <View>
      <View>
        <WorkspaceRow
          workspaceRef={ref}
          depth={depth}
          leading={options.leading}
          relation={
            hasChildren
              ? { childCount: node.children.length, collapsed, toggle: () => options.toggleCollapsed(relationKey) }
              : null
          }
        />
        {/* The parent's end of the guide: from under its status glyph to its children's line. */}
        {hasChildren && !collapsed ? <ParentStem depth={depth} /> : null}
      </View>
      {hasChildren && !collapsed ? <WorkspaceTree nodes={node.children} depth={depth + 1} options={options} /> : null}
      {/* Last, so it draws over the row's hover and selected fill. */}
      {depth > 0 ? <RelationGuide depth={depth} last={last} /> : null}
    </View>
  );
}

function flatNodes(keys: readonly string[]): RelationNode[] {
  return keys.map((key) => ({ key, children: [] }));
}

function SidebarBody({ selectedKey }: { selectedKey: string | null }) {
  const { settings, saveSettings, toggleCollapsed } = useSidebar();
  const layer = useLayer();
  const parentOf = useParentWorkspaces();
  const matches = useFilter(settings);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [dragActive, setDragActive] = useState(false);
  const collapsedKeys = useMemo(() => new Set(settings.collapsedKeys), [settings.collapsedKeys]);
  const manual = settings.sort === "manual";

  const dragScope = useMemo(
    () => ({
      active: dragActive,
      setActive: (active: boolean) => {
        if (active) layer.dismissCard();
        setDragActive(active);
      },
    }),
    [dragActive, layer],
  );

  const sortValue = (workspace: PluginWorkspaceSnapshot) =>
    settings.sort === "lastPrompt"
      ? timeOf(workspace.lastPromptAt ?? workspace.createdAt)
      : timeOf(workspace.createdAt);

  const pinned = useWorkspaces({
    where: (workspace) => matches(workspace) && workspace.pinnedAt !== null,
    orderBy: ["pinnedAt", "asc"] as const,
  });
  const indicatorGroups = useWorkspaces({ where: matches, groupBy: (workspace) => workspace.indicator });
  const byProject = useWorkspaces({
    where: (workspace) => matches(workspace) && workspace.pinnedAt === null,
    // Manual order starts from newest first; new workspaces join at the top, as in the app.
    orderBy: (a, b) => sortValue(b) - sortValue(a),
    groupBy: (workspace) => workspace.project.key,
  });
  const byStatus = useWorkspaces({
    where: (workspace) => matches(workspace) && workspace.pinnedAt === null,
    orderBy: (a, b) =>
      timeOf(b.statusEnteredAt) - timeOf(a.statusEnteredAt) || a.projectDisplayName.localeCompare(b.projectDisplayName),
    groupBy: (workspace) => workspace.indicator,
  });
  const projectRefs = useProjects({
    // The app's order for projects you haven't moved: by name, numeric-aware, case-insensitive.
    orderBy: (a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: "base" }),
    where: (project) =>
      (settings.hostFilter.length === 0 || settings.hostFilter.includes(project.hostId)) &&
      (settings.projectFilter.length === 0 || settings.projectFilter.includes(project.ref.key)),
  });

  const indicatorOf = useMemo(() => {
    const map = new Map<string, WorkspaceIndicator>();
    for (const group of indicatorGroups) {
      for (const ref of group.items) map.set(ref.key, group.key as WorkspaceIndicator);
    }
    return map;
  }, [indicatorGroups]);

  const refs = useMemo(() => {
    const map = new Map<string, WorkspaceRef>();
    for (const ref of pinned) map.set(ref.key, ref);
    for (const group of byProject) for (const ref of group.items) map.set(ref.key, ref);
    return map;
  }, [pinned, byProject]);

  const isPending = (key: string) => (indicatorOf.get(key) ?? "done") !== "done";
  const toggleExpanded = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filtering = settings.labelFilter.length > 0;
  const itemsByProject = new Map(byProject.map((group) => [group.key, group.items] as const));
  const workspaceKeysOf = (projectKey: string): string[] => {
    const keys = (itemsByProject.get(projectKey) ?? []).map((ref) => ref.key);
    return manual ? applySavedOrder(keys, settings.workspaceOrder[projectKey] ?? [], "first") : keys;
  };

  const pinnedKeys = applySavedOrder(pinned.map((ref) => ref.key), settings.pinnedOrder, "last");
  const pinnedCollapsed = collapsedKeys.has("section:pinned");
  const pinnedLayout = visibleRoots(flatNodes(pinnedKeys), {
    limit: PINNED_LIMIT,
    expanded: expanded.has("section:pinned"),
    isPending,
    selectedKey,
  });

  const projectByKey = new Map(projectRefs.map((ref) => [ref.key, ref] as const));
  const projectKeys = applySavedOrder(projectRefs.map((ref) => ref.key), settings.projectOrder, "last");
  const shownProjectKeys = projectKeys.filter((key) => !filtering || (itemsByProject.get(key) ?? []).length > 0);

  const renderProject = (projectKey: string) => {
    const projectRef = projectByKey.get(projectKey);
    if (!projectRef) return null;
    const keys = workspaceKeysOf(projectKey);
    const groupKey = `project:${projectKey}`;
    const collapsed = collapsedKeys.has(groupKey);
    const tree = visibleRoots(buildForest(keys, parentOf), {
      limit: SHOW_MORE_LIMIT,
      expanded: expanded.has(groupKey),
      isPending,
      selectedKey,
    });
    const options: TreeOptions = {
      refs,
      leading: "status",
      collapsedKeys,
      toggleCollapsed,
      onReorder: manual
        ? (siblings) =>
            saveSettings({
              workspaceOrder: {
                ...settings.workspaceOrder,
                [projectKey]: reorderWithin(keys, siblings, settings.workspaceOrder[projectKey] ?? []),
              },
            })
        : null,
    };
    return (
      <View style={{ paddingBottom: collapsed ? 0 : 12 }}>
        <ProjectHeader
          projectRef={projectRef}
          collapsed={collapsed}
          onToggle={() => toggleCollapsed(groupKey)}
          badge={mostUrgent(keys.map((key) => indicatorOf.get(key) ?? "done"))}
        />
        {collapsed ? null : keys.length === 0 ? (
          <EmptyProjectRow projectRef={projectRef} />
        ) : (
          <>
            <WorkspaceTree nodes={tree.visible} depth={0} options={options} />
            {tree.canToggle ? (
              <ShowMoreRow expanded={expanded.has(groupKey)} onPress={() => toggleExpanded(groupKey)} />
            ) : null}
          </>
        )}
      </View>
    );
  };

  return (
    <DragScopeContext.Provider value={dragScope}>
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!dragActive}
        // Dragging a row on web would otherwise select the text it passes over.
        contentContainerStyle={[{ paddingHorizontal: 8, paddingTop: 2, paddingBottom: 16 }, NO_TEXT_SELECTION]}
      >
        {pinned.length > 0 ? (
          <View style={{ marginBottom: 4 }}>
            <SectionHeader title="Pinned" onPress={() => toggleCollapsed("section:pinned")} />
            {pinnedCollapsed ? null : (
              <>
                <WorkspaceTree
                  nodes={pinnedLayout.visible}
                  depth={0}
                  options={{
                    refs,
                    leading: "status",
                    collapsedKeys,
                    toggleCollapsed,
                    onReorder: (siblings) =>
                      saveSettings({ pinnedOrder: reorderWithin(pinnedKeys, siblings, settings.pinnedOrder) }),
                  }}
                />
                {pinnedLayout.canToggle ? (
                  <ShowMoreRow expanded={expanded.has("section:pinned")} onPress={() => toggleExpanded("section:pinned")} />
                ) : null}
              </>
            )}
          </View>
        ) : null}
        <SectionHeader
          title="Workspaces"
          trailing={<DisplayButton onPress={(anchor) => layer.openMenu({ anchor, width: 232, render: () => <DisplayMenu /> })} />}
        />
        {settings.grouping === "project" ? (
          <SortableList
            ids={shownProjectKeys}
            enabled
            onReorder={(next) =>
              saveSettings({ projectOrder: reorderWithin(projectKeys, next, settings.projectOrder) })
            }
            renderItem={renderProject}
          />
        ) : (
          STATUS_GROUPS.map((status) => {
            const items = byStatus.find((group) => group.key === status.indicator)?.items ?? [];
            if (items.length === 0) return null;
            const groupKey = `status:${status.indicator}`;
            const collapsed = collapsedKeys.has(groupKey);
            const tree = visibleRoots(flatNodes(items.map((ref) => ref.key)), {
              limit: SHOW_MORE_LIMIT,
              expanded: expanded.has(groupKey),
              isPending,
              selectedKey,
            });
            return (
              <View key={groupKey} style={{ paddingBottom: collapsed ? 0 : 12 }}>
                <StatusHeader
                  indicator={status.indicator}
                  label={status.label}
                  icon={status.icon}
                  collapsed={collapsed}
                  onToggle={() => toggleCollapsed(groupKey)}
                />
                {collapsed ? null : (
                  <View style={{ paddingLeft: 8 }}>
                    <WorkspaceTree
                      nodes={tree.visible}
                      depth={0}
                      options={{ refs, leading: "project", collapsedKeys, toggleCollapsed, onReorder: null }}
                    />
                    {tree.canToggle ? (
                      <ShowMoreRow expanded={expanded.has(groupKey)} onPress={() => toggleExpanded(groupKey)} />
                    ) : null}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </DragScopeContext.Provider>
  );
}

// react-native-web reads userSelect; RN's style types don't list it.
const NO_TEXT_SELECTION = { userSelect: "none" } as ViewStyle;

export function RelationsSidebarView({ theme, layout, active, navigation, dismiss }: PluginSidebarViewProps) {
  const palette = useMemo(() => paletteFor(theme), [theme]);
  const rootRef = useRef<View>(null);
  const settingsState = useSettings(sidebarSettings);
  const settings = settingsState.status === "ready" ? settingsState.values : DEFAULT_SIDEBAR_SETTINGS;
  const hosts = useHosts();
  const projectKeys = useProjectKeys();
  const labelGroups = useWorkspaces({ groupBy: (workspace) => [...workspace.labels] });

  const saveSettings = useCallback(
    (patch: Partial<SidebarSettings>) => {
      if (settingsState.status !== "ready") return;
      void settingsState.save({ ...settingsState.values, ...patch }, settingsState.revision);
    },
    [settingsState],
  );

  useImportAppOrder({
    ready: settingsState.status === "ready",
    imported: settings.importedAppOrder,
    projectKeys,
    save: saveSettings,
  });

  const toggleCollapsed = useCallback(
    (key: string) => {
      const next = settings.collapsedKeys.includes(key)
        ? settings.collapsedKeys.filter((item) => item !== key)
        : [...settings.collapsedKeys, key];
      saveSettings({ collapsedKeys: next });
    },
    [settings.collapsedKeys, saveSettings],
  );

  const context = useMemo<SidebarContextValue>(
    () => ({
      palette,
      settings,
      saveSettings,
      toggleCollapsed,
      navigation,
      dismiss,
      activeWorkspaceKey: active.workspace?.key ?? null,
      hoverEnabled: !layout.compact && layout.platform === "web",
      multiHost: hosts.length > 1,
      hostLabels: new Map(hosts.map((host) => [host.serverId, host.label] as const)),
      labelNames: labelGroups.map((group) => group.key).sort((a, b) => a.localeCompare(b)),
      projectColorKey: (hostId, projectId) =>
        projectKeys?.get(projectKeyId(hostId, projectId)) ?? JSON.stringify([hostId, projectId]),
    }),
    [palette, settings, saveSettings, toggleCollapsed, navigation, dismiss, active.workspace?.key, layout, hosts, labelGroups, projectKeys],
  );

  return (
    <SidebarContext.Provider value={context}>
      <View ref={rootRef} style={{ flex: 1 }}>
        <LayerHost rootRef={rootRef} palette={palette}>
          <SidebarBody selectedKey={active.workspace?.key ?? null} />
        </LayerHost>
      </View>
    </SidebarContext.Provider>
  );
}
