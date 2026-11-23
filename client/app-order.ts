import { useEffect } from "react";
import { Platform } from "react-native";
import { useProjects, useWorkspaces } from "@getpaseo/plugin/client";
import { z } from "zod";
import type { SidebarSettings } from "../shared/settings";
import { projectKeyId } from "./data";

/*
 * The app keeps its sidebar order on the device, in zustand stores persisted to AsyncStorage
 * (localStorage on web): packages/app/src/stores/sidebar-order-store.ts and sidebar-view-store.ts.
 * Plugins can't reach them, so on web the view copies them once to start from the order you
 * already have. Anything that doesn't parse is skipped; the order then starts empty.
 */
const APP_ORDER_KEY = "sidebar-project-workspace-order";
const APP_VIEW_KEY = "sidebar-view";

const AppOrderSchema = z.object({
  state: z.object({
    /** Project view keys: the shared project key, or JSON [serverId, projectId]. */
    projectOrder: z.array(z.string()).optional(),
    /** Workspace keys: `${serverId}:${workspaceId}`. */
    pinnedWorkspaceOrder: z.array(z.string()).optional(),
    workspaceOrderByProject: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

const AppViewSchema = z.object({
  state: z.object({ workspaceSort: z.enum(["manual", "created", "lastPrompt"]).optional() }),
});

function readAppStore<T>(key: string, schema: z.ZodType<T>): T | null {
  const storage = (globalThis as unknown as { localStorage?: { getItem(key: string): string | null } }).localStorage;
  const raw = storage?.getItem(key);
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function useImportAppOrder({
  ready,
  imported,
  projectKeys,
  save,
}: {
  ready: boolean;
  imported: boolean;
  projectKeys: ReadonlyMap<string, string> | null;
  save: (patch: Partial<SidebarSettings>) => void;
}): void {
  const projects = useProjects();
  const workspacesByProject = useWorkspaces({ groupBy: (workspace) => workspace.project.key });
  const pending = Platform.OS === "web" && ready && !imported;

  useEffect(() => {
    if (!pending || !projectKeys || projects.length === 0 || workspacesByProject.length === 0) return;
    const order = readAppStore(APP_ORDER_KEY, AppOrderSchema)?.state;
    const view = readAppStore(APP_VIEW_KEY, AppViewSchema)?.state;

    const projectsByViewKey = new Map<string, string[]>();
    for (const ref of projects) {
      const viewKeys = [projectKeys.get(projectKeyId(ref.hostId, ref.id)), JSON.stringify([ref.hostId, ref.id])];
      for (const viewKey of viewKeys) {
        if (!viewKey) continue;
        const refs = projectsByViewKey.get(viewKey) ?? [];
        refs.push(ref.key);
        projectsByViewKey.set(viewKey, refs);
      }
    }
    const workspaceKeyOf = new Map<string, string>();
    const projectOf = new Map<string, string>();
    for (const group of workspacesByProject) {
      for (const ref of group.items) {
        workspaceKeyOf.set(`${ref.hostId}:${ref.id}`, ref.key);
        projectOf.set(ref.key, group.key);
      }
    }

    const workspaceOrder: Record<string, string[]> = {};
    for (const appKeys of Object.values(order?.workspaceOrderByProject ?? {})) {
      for (const appKey of appKeys) {
        const key = workspaceKeyOf.get(appKey);
        const project = key ? projectOf.get(key) : undefined;
        if (key && project) (workspaceOrder[project] ??= []).push(key);
      }
    }
    save({
      projectOrder: [...new Set((order?.projectOrder ?? []).flatMap((viewKey) => projectsByViewKey.get(viewKey) ?? []))],
      pinnedOrder: (order?.pinnedWorkspaceOrder ?? []).flatMap((appKey) => workspaceKeyOf.get(appKey) ?? []),
      workspaceOrder,
      ...(view?.workspaceSort ? { sort: view.workspaceSort } : {}),
      importedAppOrder: true,
    });
  }, [pending, projectKeys, projects, workspacesByProject, save]);
}
