import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const SidebarSettingsSchema = z.object({
  grouping: z.enum(["project", "status"]).default("project"),
  sort: z.enum(["manual", "created", "lastPrompt"]).default("created"),
  title: z.enum(["title", "branch"]).default("title"),
  show: z
    .object({
      branch: z.boolean().default(false),
      project: z.boolean().default(false),
      host: z.boolean().default(true),
      pullRequest: z.boolean().default(true),
      services: z.boolean().default(true),
      labels: z.boolean().default(true),
    })
    .default({ branch: false, project: false, host: true, pullRequest: true, services: true, labels: true }),
  checks: z.enum(["iconAndText", "icon", "hidden"]).default("icon"),
  trailing: z.enum(["timestamp", "diff", "none"]).default("timestamp"),
  hostFilter: z.array(z.string()).default([]),
  projectFilter: z.array(z.string()).default([]),
  labelFilter: z.array(z.string()).default([]),
  showBackground: z.boolean().default(false),
  collapsedKeys: z.array(z.string()).default([]),
  /** Manual order, by ref key: projects, pinned workspaces, and each project's workspaces. */
  projectOrder: z.array(z.string()).default([]),
  pinnedOrder: z.array(z.string()).default([]),
  workspaceOrder: z.record(z.string(), z.array(z.string())).default({}),
  /** How often to ask the forge for review status, in seconds; 0 only on request. */
  prRefreshSeconds: z.number().int().min(0).default(60),
  /** Set once the app sidebar's own order (web) has been copied in. */
  importedAppOrder: z.boolean().default(false),
});

export type SidebarSettings = z.infer<typeof SidebarSettingsSchema>;

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = SidebarSettingsSchema.parse({});

export const sidebarSettings = defineSettings({
  id: "workspace-relations-sidebar",
  scope: "device",
  version: 1,
  schema: SidebarSettingsSchema,
});
