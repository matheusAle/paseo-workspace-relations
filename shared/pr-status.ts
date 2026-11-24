import { defineRpc, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

export const PrStatusEventSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    forge: z.enum(["github", "gitlab"]),
    number: z.number(),
    url: z.string(),
    state: z.enum(["draft", "open", "merged", "closed"]),
    mergeable: z.enum(["mergeable", "conflicting", "unknown"]),
    approvalsGiven: z.number(),
    /** Null when the forge/permissions don't expose the required-reviewer count. */
    approvalsRequired: z.number().nullable(),
  }),
]);

export type PrStatusEvent = z.infer<typeof PrStatusEventSchema>;
export type PrStatusFound = Extract<PrStatusEvent, { found: true }>;

/** Refresh choices offered in the display menu, in seconds; 0 refreshes only on request. */
export const PR_REFRESH_CHOICES = [30, 60, 120, 300, 900, 0] as const;

export const prStatusWatch = defineSubscription({
  name: "workspace-relations.pr-status.watch",
  input: z.object({
    workspaceId: z.string(),
    /** How often this watcher wants the forge asked again; 0 means only on refresh. */
    intervalSeconds: z.number().int().min(0),
  }),
  event: PrStatusEventSchema,
});

/**
 * Asks the forge again for watched workspaces. `force` is a person asking: it always runs and
 * skips the cached required-approval count. Without it, a request right after a fetch is dropped.
 */
export const prStatusRefresh = defineRpc({
  name: "workspace-relations.pr-status.refresh",
  input: z.object({ workspaceIds: z.array(z.string()), force: z.boolean() }),
  output: z.object({ refreshed: z.number() }),
});
