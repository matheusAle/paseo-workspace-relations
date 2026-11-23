import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { Palette } from "./look";

export function MenuItem({
  label,
  icon,
  value,
  submenu,
  checked,
  destructive,
  disabled,
  onPress,
  palette,
}: {
  label: string;
  icon?: string;
  value?: string;
  submenu?: boolean;
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  palette: Palette;
}) {
  const [hovered, setHovered] = useState(false);
  const color = destructive ? palette.danger : palette.foreground;
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 32,
        paddingHorizontal: 8,
        borderRadius: 6,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? palette.pressed : hovered ? palette.selected : "transparent",
      })}
    >
      {icon ? <Icon name={icon} size={14} color={destructive ? palette.danger : palette.muted} /> : null}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color }}>
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={{ fontSize: 14, color: palette.muted }}>
          {value}
        </Text>
      ) : null}
      {checked ? <Icon name="Check" size={14} color={palette.foreground} /> : null}
      {submenu ? <Icon name="ChevronRight" size={14} color={palette.muted} /> : null}
    </Pressable>
  );
}

export function MenuSeparator({ palette }: { palette: Palette }) {
  return <View style={{ height: 1, marginVertical: 4, marginHorizontal: -4, backgroundColor: palette.cardBorder }} />;
}

export function MenuBack({ title, onPress, palette }: { title: string; onPress: () => void; palette: Palette }) {
  return (
    <>
      <MenuItem label={title} icon="ChevronLeft" onPress={onPress} palette={palette} />
      <MenuSeparator palette={palette} />
    </>
  );
}
