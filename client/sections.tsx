import { useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, Text, View, type GestureResponderEvent } from "react-native";
import type { WorkspaceIndicator } from "@getpaseo/plugin";
import { useProject, type ProjectRef } from "@getpaseo/plugin/client";
import { copyText, Icon } from "@getpaseo/plugin/client/ui";
import { useSidebar } from "./context";
import { ProjectAvatar } from "./glyphs";
import { contextMenuProps, useLayer } from "./layer";
import { useDragActive, useSortableHandle } from "./sortable";
import type { Palette } from "./look";
import { MenuItem } from "./menu";

const CHEVRON_COLOR = "#9ca3af";

function HeaderButton({ icon, iconSize, size, label, visible, onPress, palette }: { icon: string; iconSize: number; size: number; label: string; visible: boolean; onPress: (anchor: View | null) => void; palette: Palette }) {
  const ref = useRef<View>(null);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={(event: GestureResponderEvent) => event.stopPropagation()}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        onPress(ref.current);
      }}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        opacity: visible ? 1 : 0,
        backgroundColor: hovered ? palette.pressed : "transparent",
      }}
    >
      <Icon name={icon} size={iconSize} color={hovered ? palette.foreground : palette.muted} />
    </Pressable>
  );
}

/** "Workspaces" / "Pinned": the small muted label above a list, with an optional trailing control. */
export function SectionHeader({ title, trailing, onPress }: { title: string; trailing?: ReactNode; onPress?: () => void }) {
  const { palette } = useSidebar();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={{ minHeight: 36, paddingLeft: 8, paddingRight: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}
    >
      <Text style={{ fontSize: 12, color: palette.muted }}>{title}</Text>
      {trailing}
    </Pressable>
  );
}

export function DisplayButton({ onPress }: { onPress: (anchor: View | null) => void }) {
  const { palette } = useSidebar();
  return <HeaderButton icon="Settings2" iconSize={14} size={28} label="Display preferences" visible onPress={onPress} palette={palette} />;
}

function openAppRoute(path: string): void {
  // The app routes from the URL on web; push the path and let the router's popstate listener follow.
  const scope = globalThis as unknown as {
    history?: { pushState(state: unknown, title: string, url: string): void };
    dispatchEvent?: (event: unknown) => boolean;
    PopStateEvent?: new (type: string) => unknown;
  };
  if (!scope.history || !scope.dispatchEvent || !scope.PopStateEvent) return;
  scope.history.pushState(null, "", path);
  scope.dispatchEvent(new scope.PopStateEvent("popstate"));
}

function ProjectMenu({ projectRef, rootPath, close }: { projectRef: ProjectRef; rootPath: string; close: () => void }) {
  const { palette } = useSidebar();
  return (
    <View>
      {Platform.OS === "web" ? (
        <MenuItem
          label="Open project settings"
          icon="Settings"
          palette={palette}
          onPress={() => {
            close();
            openAppRoute(
              `/settings/hosts/${encodeURIComponent(projectRef.hostId)}/projects/${encodeURIComponent(projectRef.id)}`,
            );
          }}
        />
      ) : null}
      <MenuItem
        label="Copy path"
        icon="Copy"
        palette={palette}
        onPress={() => {
          close();
          void copyText(rootPath);
        }}
      />
    </View>
  );
}

export function ProjectHeader({
  projectRef,
  collapsed,
  onToggle,
  badge,
}: {
  projectRef: ProjectRef;
  collapsed: boolean;
  onToggle: () => void;
  badge: WorkspaceIndicator | null;
}) {
  const { palette, navigation, hoverEnabled, projectColorKey } = useSidebar();
  const layer = useLayer();
  const project = useProject(projectRef);
  const sortable = useSortableHandle();
  const dragActive = useDragActive();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState<"kebab" | "context" | null>(null);
  if (!project) return null;

  const showControls = hovered || menuOpen === "kebab";
  const openMenu = (kind: "kebab" | "context", target: { anchor: View | null } | { point: { x: number; y: number } }) => {
    setMenuOpen(kind);
    if (kind === "context") setHovered(false);
    layer.openMenu({
      ...target,
      width: 220,
      render: (close) => <ProjectMenu projectRef={projectRef} rootPath={project.rootPath} close={close} />,
      onClose: () => setMenuOpen(null),
    });
  };

  return (
    // Hover on a plain View (docs/hover.md), so moving onto + or the actions button keeps it.
    <View
      style={{ position: "relative" }}
      {...sortable?.viewProps}
      {...contextMenuProps((point) => openMenu("context", { point }))}
      onPointerEnter={() => {
        if (menuOpen !== "context" && !dragActive) setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
    <Pressable
      // No button role: it would render as <button>, and the header holds the + and actions buttons.
      accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${project.displayName}`}
      {...sortable?.pressProps}
      onPress={onToggle}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 8,
        marginBottom: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: pressed ? palette.pressed : hovered || menuOpen !== null ? palette.hover : "transparent",
        ...(sortable?.dragging ? { backgroundColor: palette.selected, borderWidth: 1, borderColor: palette.border } : null),
      })}
    >
      {showControls ? (
        <View style={{ width: 16, height: 20, alignItems: "center", justifyContent: "center" }}>
          <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={14} color={CHEVRON_COLOR} />
        </View>
      ) : (
        <ProjectAvatar
          name={project.displayName}
          colorKey={projectColorKey(projectRef.hostId, projectRef.id)}
          badge={collapsed ? badge : null}
          badgeBackground={palette.surface0}
          palette={palette}
        />
      )}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: palette.muted }}>
        {project.displayName}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginRight: -6 }}>
        <HeaderButton
          icon="Plus"
          iconSize={15}
          size={24}
          label={`New workspace in ${project.displayName}`}
          visible={showControls || !hoverEnabled}
          palette={palette}
          onPress={() => navigation.openProject(projectRef)}
        />
        <HeaderButton
          icon="EllipsisVertical"
          iconSize={14}
          size={24}
          label={`${project.displayName} actions`}
          visible={showControls || !hoverEnabled}
          palette={palette}
          onPress={(anchor) => openMenu("kebab", { anchor })}
        />
      </View>
    </Pressable>
    </View>
  );
}

export const STATUS_GROUPS: readonly { indicator: WorkspaceIndicator; label: string; icon: string }[] = [
  { indicator: "needs_input", label: "Needs input", icon: "CircleAlert" },
  { indicator: "failed", label: "Failed", icon: "CircleX" },
  { indicator: "attention", label: "Ready to review", icon: "CircleCheck" },
  { indicator: "running", label: "Working", icon: "CircleDot" },
  { indicator: "done", label: "Done", icon: "CircleCheck" },
];

export function StatusHeader({ indicator, label, icon, collapsed, onToggle }: { indicator: WorkspaceIndicator; label: string; icon: string; collapsed: boolean; onToggle: () => void }) {
  const { palette } = useSidebar();
  const [hovered, setHovered] = useState(false);
  const color =
    indicator === "needs_input"
      ? palette.dotWarning
      : indicator === "failed"
        ? palette.dotDanger
        : indicator === "attention"
          ? palette.dotSuccess
          : indicator === "running"
            ? palette.dotRunning
            : palette.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${label}`}
      onPress={onToggle}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 8,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: pressed ? palette.pressed : hovered ? palette.hover : "transparent",
      })}
    >
      <View style={{ width: 16, height: 20, alignItems: "center", justifyContent: "center" }}>
        <Icon name={hovered ? (collapsed ? "ChevronRight" : "ChevronDown") : icon} size={14} color={hovered ? CHEVRON_COLOR : color} />
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: palette.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function GhostRow({ icon, label, onPress, indent }: { icon: string; label: string; onPress: () => void; indent: number }) {
  const { palette } = useSidebar();
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingVertical: 8,
        paddingLeft: indent,
        paddingRight: 12,
        borderRadius: 8,
        marginBottom: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: pressed ? palette.pressed : hovered ? palette.hover : "transparent",
      })}
    >
      <View style={{ width: 16, alignItems: "center" }}>
        <Icon name={icon} size={14} color={hovered ? palette.foreground : palette.muted} />
      </View>
      <Text style={{ fontSize: 14, color: hovered ? palette.foreground : palette.muted }}>{label}</Text>
    </Pressable>
  );
}

export function ShowMoreRow({ expanded, onPress }: { expanded: boolean; onPress: () => void }) {
  return <GhostRow icon={expanded ? "ChevronUp" : "ChevronDown"} label={expanded ? "Show less" : "Show more"} onPress={onPress} indent={8} />;
}

export function EmptyProjectRow({ projectRef }: { projectRef: ProjectRef }) {
  const { navigation } = useSidebar();
  return <GhostRow icon="Plus" label="New workspace" onPress={() => navigation.openProject(projectRef)} indent={16} />;
}
