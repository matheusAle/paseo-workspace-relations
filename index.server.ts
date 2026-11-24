import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createPrStatusHub } from "./server/pr-status-hub";
import { resolveWorkspacePrStatus } from "./server/pr-status";
import { prStatusRefresh, prStatusWatch } from "./shared/pr-status";

export default function contribute(server: PluginServerContext) {
  const hub = createPrStatusHub(resolveWorkspacePrStatus);
  // Stay synchronous: a subscription handler that returns a promise closes when it settles.
  server.handle(prStatusWatch, (input, context) => {
    hub.watch({
      workspaceId: input.workspaceId,
      intervalSeconds: input.intervalSeconds,
      context: context.paseo,
      push: (event) => context.push(event),
      signal: context.signal,
    });
  });
  server.handle(prStatusRefresh, (input) => ({ refreshed: hub.refresh(input.workspaceIds, input.force) }));
  return () => {};
}
