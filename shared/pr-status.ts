import { defineSubscription } from "@getpaseo/plugin";
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

export const prStatusWatch = defineSubscription({
  name: "workspace-relations.pr-status.watch",
  input: z.object({ workspaceId: z.string() }),
  event: PrStatusEventSchema,
});
