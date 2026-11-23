import { createContext, useContext } from "react";
import type { PluginSidebarViewProps } from "@getpaseo/plugin/client";
import type { SidebarSettings } from "../shared/settings";
import type { Palette } from "./look";

export interface SidebarContextValue {
  readonly palette: Palette;
  readonly settings: SidebarSettings;
  saveSettings(patch: Partial<SidebarSettings>): void;
  toggleCollapsed(key: string): void;
  readonly navigation: PluginSidebarViewProps["navigation"];
  dismiss(): void;
  readonly activeWorkspaceKey: string | null;
  readonly hoverEnabled: boolean;
  readonly multiHost: boolean;
  readonly hostLabels: ReadonlyMap<string, string>;
  readonly labelNames: readonly string[];
  projectColorKey(hostId: string, projectId: string): string;
}

export const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("useSidebar must be used inside the relations sidebar view");
  return value;
}
