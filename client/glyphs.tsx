import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Text, View } from "react-native";
import type { PluginWorkspaceSnapshot, WorkspaceIndicator } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { avatarLetter, identityColor, type Palette } from "./look";

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function RunningRing({ color }: { color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);
  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 12,
          height: 12,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: withAlpha(color, 0.3),
          borderTopColor: withAlpha(color, 0.9),
          transform: [{ rotate }],
        }}
      />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

function Dot({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity }} />;
}

const KIND_ICON: Record<PluginWorkspaceSnapshot["kind"], string> = {
  local_checkout: "Monitor",
  worktree: "FolderGit2",
  checkout: "Folder",
  directory: "Folder",
};

/** The leading glyph of a workspace row, per the app's status buckets. */
export function StatusIndicator({
  indicator,
  kind,
  palette,
}: {
  indicator: WorkspaceIndicator;
  kind: PluginWorkspaceSnapshot["kind"];
  palette: Palette;
}) {
  let glyph;
  if (indicator === "running") glyph = <RunningRing color={palette.dotRunning} />;
  else if (indicator === "needs_input") glyph = <Icon name="CircleAlert" size={12} color={palette.dotWarning} />;
  else if (indicator === "attention") glyph = <Dot color={palette.dotSuccess} />;
  else if (indicator === "failed") {
    glyph = (
      <View>
        <Icon name={KIND_ICON[kind]} size={14} color={palette.muted} />
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 8,
            height: 8,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: palette.surface0,
            backgroundColor: palette.dotDanger,
          }}
        />
      </View>
    );
  } else glyph = <Dot color={palette.extraMuted} opacity={0.3} />;

  return <View style={{ width: 16, height: 20, alignItems: "center", justifyContent: "center" }}>{glyph}</View>;
}

const BADGE_PRIORITY: readonly WorkspaceIndicator[] = ["needs_input", "failed", "running", "attention"];

export function mostUrgent(indicators: Iterable<WorkspaceIndicator>): WorkspaceIndicator | null {
  const present = new Set(indicators);
  return BADGE_PRIORITY.find((indicator) => present.has(indicator)) ?? null;
}

export function ProjectAvatar({
  name,
  colorKey,
  badge,
  badgeBackground,
  palette,
}: {
  name: string;
  colorKey: string;
  badge?: WorkspaceIndicator | null;
  badgeBackground?: string;
  palette: Palette;
}) {
  let badgeGlyph = null;
  if (badge === "needs_input") badgeGlyph = <Icon name="CircleAlert" size={12} color={palette.dotWarning} />;
  else if (badge === "running") badgeGlyph = <Dot color={palette.dotRunning} />;
  else if (badge === "failed") badgeGlyph = <Dot color={palette.dotDanger} />;
  else if (badge === "attention") badgeGlyph = <Dot color={palette.dotSuccess} />;

  return (
    <View style={{ width: 16, height: 20, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: identityColor(colorKey),
        }}
      >
        <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: "600" }}>{avatarLetter(name)}</Text>
      </View>
      {badgeGlyph ? (
        <View
          style={{
            position: "absolute",
            right: -4,
            bottom: -2,
            width: 12,
            height: 12,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: badgeBackground ?? palette.surface0,
          }}
        >
          {badgeGlyph}
        </View>
      ) : null}
    </View>
  );
}
