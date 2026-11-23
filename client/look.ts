import type { PluginTheme } from "@getpaseo/plugin";

/**
 * Colors the native sidebar uses that the plugin theme doesn't carry. Values are Paseo's own
 * defaults (packages/app/src/styles/theme.ts); the plugin theme supplies everything it does carry.
 */
export interface Palette {
  readonly foreground: string;
  readonly muted: string;
  readonly extraMuted: string;
  readonly border: string;
  readonly hover: string;
  readonly selected: string;
  readonly pressed: string;
  readonly card: string;
  readonly cardBorder: string;
  readonly surface0: string;
  readonly success: string;
  readonly danger: string;
  readonly warning: string;
  readonly merged: string;
  readonly dotSuccess: string;
  readonly dotDanger: string;
  readonly dotWarning: string;
  readonly dotRunning: string;
}

function isDark(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return true;
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function paletteFor(theme: PluginTheme): Palette {
  const dark = isDark(theme.colors.surface0);
  return {
    foreground: theme.colors.foreground,
    muted: theme.colors.foregroundMuted,
    extraMuted: dark ? "#717574" : "#a1a1aa",
    border: theme.colors.border,
    hover: theme.colors.surface1,
    selected: theme.colors.surface2,
    pressed: theme.colors.surface2,
    card: theme.colors.surface1,
    cardBorder: dark ? "#2F3534" : "#d4d4d8",
    surface0: theme.colors.surface0,
    success: theme.colors.statusSuccess,
    danger: theme.colors.statusDanger,
    warning: theme.colors.statusWarning,
    merged: "#a890d5",
    dotSuccess: "#35c264",
    dotDanger: "#f7796d",
    dotWarning: "#db932e",
    dotRunning: "#5caaf6",
  };
}

const IDENTITY_COLORS = [
  "#7a6aa8",
  "#3d7ea6",
  "#388068",
  "#a4673a",
  "#b05c80",
  "#6a70b8",
  "#368080",
  "#b06260",
  "#8f7838",
  "#5179b0",
] as const;

/** Same hash and palette order as the app's project avatars, so colors match the default sidebar. */
export function identityColor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return IDENTITY_COLORS[hash % IDENTITY_COLORS.length];
}

export function avatarLetter(name: string): string {
  const segment = name.split("/").filter(Boolean).pop() ?? name;
  return (segment.trim().charAt(0) || "?").toUpperCase();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "now", "5m", "21h", "3d", then "Nov 10" from a week on — the app's sidebar formatter. */
export function formatAge(iso: string | null, now: number = Date.now()): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function shortenPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join("/")}`;
}
