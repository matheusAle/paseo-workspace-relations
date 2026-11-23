import type { PluginServerContext } from "@getpaseo/plugin/server";
import { watchPrStatus } from "./server/pr-status";
import { prStatusWatch } from "./shared/pr-status";

export default function contribute(server: PluginServerContext) {
  server.handle(prStatusWatch, watchPrStatus);
  return () => {};
}
