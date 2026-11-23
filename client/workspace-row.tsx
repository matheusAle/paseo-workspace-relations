import { useRef, useState } from "react";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import { useWorkspace, type WorkspaceRef } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useSidebar } from "./context";
import { useWorkspaceDescriptor } from "./data";
import { ProjectAvatar, StatusIndicator } from "./glyphs";
import { contextMenuProps, useLayer } from "./layer";
import { useDragActive, useSortableHandle } from "./sortable";
import { formatAge, type Palette } from "./look";
import { useWorkspaceActions, WorkspaceMenu } from "./workspace-actions";
import { WorkspaceCard } from "./workspace-card";
import { WorkspaceMeta } from "./workspace-meta";

export const INDENT = 16;
/** Where a row's status glyph is vertically centred: its top padding plus half the title line. */
export const ROW_GLYPH_CENTER = 18;

function RowButton({ icon, label, onPress, palette, marginRight }: { icon: string; label: string; onPress: (anchor: View | null) => void; palette: Palette; marginRight: number }) {
  const ref = useRef<View>(null);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      // Claim the press before the row does, as the app's nested row controls do.
      onPressIn={(event: GestureResponderEvent) => event.stopPropagation()}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        onPress(ref.current);
      }}
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        marginRight,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hovered ? palette.pressed : "transparent",
      }}
    >
      <Icon name={icon} size={14} color={hovered ? palette.foreground : palette.muted} />
    </Pressable>
  );
}

export interface RelationControl {
  readonly childCount: number;
  readonly collapsed: boolean;
  toggle(): void;
}

export function WorkspaceRow({
  workspaceRef,
  depth,
  relation,
  leading,
}: {
  workspaceRef: WorkspaceRef;
  depth: number;
  relation: RelationControl | null;
  /** "status" grouping shows the project avatar instead of the status dot. */
  leading: "status" | "project";
}) {
  const { palette, settings, navigation, dismiss, activeWorkspaceKey, hoverEnabled, hostLabels, projectColorKey } = useSidebar();
  const layer = useLayer();
  const { archive } = useWorkspaceActions();
  const workspace = useWorkspace(workspaceRef);
  const descriptor = useWorkspaceDescriptor(workspaceRef);
  const rowRef = useRef<View>(null);
  const sortable = useSortableHandle();
  const dragActive = useDragActive();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState<"kebab" | "context" | null>(null);
  if (!workspace || workspace.archivingAt) return null;

  const selected = activeWorkspaceKey === workspaceRef.key;
  // The kebab stays while its menu is open; a right-click menu takes the row's hover, as in the app.
  const showActions = hovered || menuOpen === "kebab" || !hoverEnabled;
  const highlighted = hovered || menuOpen !== null;
  const openMenu = (kind: "kebab" | "context", target: { anchor: View | null } | { point: { x: number; y: number } }) => {
    setMenuOpen(kind);
    if (kind === "context") setHovered(false);
    layer.openMenu({
      ...target,
      width: 260,
      render: (close) => <WorkspaceMenu workspaceRef={workspaceRef} close={close} />,
      onClose: () => setMenuOpen(null),
    });
  };
  const title = settings.title === "branch" ? (workspace.branch ?? workspace.name) : workspace.name;
  const age = formatAge(workspace.statusEnteredAt);
  const indent = 8 + depth * INDENT;

  let trailing = null;
  if (settings.trailing === "timestamp" && age) {
    trailing = <Text style={{ fontSize: 12, lineHeight: 20, color: palette.extraMuted }}>{age}</Text>;
  } else if (settings.trailing === "diff" && workspace.diffStat) {
    trailing = (
      <View style={{ flexDirection: "row", gap: 4 }}>
        <Text style={{ fontSize: 12, lineHeight: 20, color: palette.success }}>+{workspace.diffStat.additions}</Text>
        <Text style={{ fontSize: 12, lineHeight: 20, color: palette.danger }}>-{workspace.diffStat.deletions}</Text>
      </View>
    );
  }

  let leadingGlyph =
    leading === "project" ? (
      <ProjectAvatar
        name={workspace.projectDisplayName}
        colorKey={projectColorKey(workspace.hostId, workspace.projectId)}
        badge={workspace.indicator === "done" ? null : workspace.indicator}
        badgeBackground={selected ? palette.selected : highlighted ? palette.hover : palette.surface0}
        palette={palette}
      />
    ) : (
      <StatusIndicator indicator={workspace.indicator} kind={workspace.kind} palette={palette} />
    );
  if (relation && relation.childCount > 0 && (hovered || relation.collapsed)) {
    leadingGlyph = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={relation.collapsed ? "Show sub-agent workspaces" : "Hide sub-agent workspaces"}
        onPressIn={(event: GestureResponderEvent) => event.stopPropagation()}
        onPress={(event: GestureResponderEvent) => {
          event.stopPropagation();
          relation.toggle();
        }}
        style={{ width: 16, height: 20, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name={relation.collapsed ? "ChevronRight" : "ChevronDown"} size={14} color="#9ca3af" />
      </Pressable>
    );
  }

  return (
    // Hover lives on this plain View (docs/hover.md): pointerenter/leave don't fire when the cursor
    // moves onto the nested buttons, so the archive/kebab/chevron reveal stays put.
    <View
      ref={rowRef}
      style={{ position: "relative" }}
      {...sortable?.viewProps}
      {...contextMenuProps((point) => openMenu("context", { point }))}
      onPointerEnter={
        hoverEnabled
          ? () => {
              if (menuOpen === "context" || dragActive) return;
              setHovered(true);
              layer.showCard({ key: workspaceRef.key, anchor: rowRef.current, render: () => <WorkspaceCard workspaceRef={workspaceRef} /> });
            }
          : undefined
      }
      onPointerLeave={
        hoverEnabled
          ? () => {
              setHovered(false);
              layer.hideCard(workspaceRef.key);
            }
          : undefined
      }
    >
    <Pressable
      // No button role: react-native-web renders that as <button>, and the row holds its own buttons.
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      {...sortable?.pressProps}
      onPress={() => {
        layer.hideCard(workspaceRef.key);
        navigation.openWorkspace(workspaceRef);
        dismiss();
      }}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingVertical: 8,
        paddingLeft: indent,
        paddingRight: 12,
        borderRadius: 8,
        marginBottom: 2,
        flexDirection: "row",
        gap: 8,
        backgroundColor: pressed ? palette.pressed : selected ? palette.selected : highlighted ? palette.hover : "transparent",
        // The app's lifted row while it's being dragged.
        ...(sortable?.dragging ? { backgroundColor: palette.selected, borderWidth: 1, borderColor: palette.border } : null),
      })}
    >
      {leadingGlyph}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 14,
              lineHeight: 20,
              color: palette.foreground,
              opacity: highlighted || selected ? 1 : 0.76,
            }}
          >
            {title}
          </Text>
          {showActions ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {hoverEnabled ? (
                <RowButton
                  icon="Archive"
                  label="Archive workspace"
                  marginRight={8}
                  palette={palette}
                  onPress={() => {
                    layer.hideCard(workspaceRef.key);
                    archive(workspaceRef, workspace, descriptor);
                  }}
                />
              ) : null}
              <RowButton
                icon="EllipsisVertical"
                label="Workspace actions"
                marginRight={-7}
                palette={palette}
                onPress={(anchor) => openMenu("kebab", { anchor })}
              />
            </View>
          ) : (
            trailing
          )}
        </View>
        <WorkspaceMeta
          workspace={workspace}
          descriptor={descriptor}
          hostLabel={hostLabels.get(workspace.hostId) ?? null}
          hiddenChildren={relation?.collapsed ? relation.childCount : 0}
        />
      </View>
    </Pressable>
    </View>
  );
}
