import type { PrStatusEvent } from "../shared/pr-status";

/** Fetches one workspace's status; `force` skips caches. Context is whatever the fetch needs. */
export type ResolvePrStatus<Context> = (workspaceId: string, context: Context, force: boolean) => Promise<PrStatusEvent>;

export interface PrStatusHub<Context> {
  /** Streams a workspace's status to `push` until `signal` aborts. */
  watch(input: {
    workspaceId: string;
    intervalSeconds: number;
    context: Context;
    push: (event: PrStatusEvent) => unknown;
    signal: AbortSignal;
  }): void;
  /** Fetches the watched workspaces among `workspaceIds` again; returns how many it started. */
  refresh(workspaceIds: readonly string[], force: boolean): number;
}

interface Watcher {
  readonly intervalSeconds: number;
  readonly push: (event: PrStatusEvent) => unknown;
}

interface Entry<Context> {
  readonly workspaceId: string;
  readonly watchers: Set<Watcher>;
  context: Context;
  last: PrStatusEvent | null;
  lastJson: string | null;
  running: boolean;
  /** A forced refresh asked for while a fetch was running; it runs once that one finishes. */
  forceQueued: boolean;
  finishedAt: number;
  timer: ReturnType<typeof setInterval> | null;
  timerSeconds: number;
}

/**
 * One fetch loop per workspace, however many rows, cards and devices watch it. The loop runs at
 * the shortest interval any watcher asks for, and stops when the last watcher leaves.
 */
export function createPrStatusHub<Context>(
  resolve: ResolvePrStatus<Context>,
  options: { minGapMs?: number; now?: () => number } = {},
): PrStatusHub<Context> {
  const minGapMs = options.minGapMs ?? 5_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry<Context>>();

  const send = (watcher: Watcher, event: PrStatusEvent) => {
    void Promise.resolve()
      .then(() => watcher.push(event))
      .catch(() => {});
  };

  const run = (entry: Entry<Context>, force: boolean) => {
    if (entry.running) {
      if (force) entry.forceQueued = true;
      return;
    }
    entry.running = true;
    void resolve(entry.workspaceId, entry.context, force)
      .then((event) => {
        if (entries.get(entry.workspaceId) !== entry) return;
        const json = JSON.stringify(event);
        if (json === entry.lastJson) return;
        entry.last = event;
        entry.lastJson = json;
        for (const watcher of entry.watchers) send(watcher, event);
      })
      // A failed fetch keeps showing the last status.
      .catch(() => {})
      .finally(() => {
        entry.running = false;
        entry.finishedAt = now();
        if (entry.forceQueued && entries.get(entry.workspaceId) === entry) {
          entry.forceQueued = false;
          run(entry, true);
        }
      });
  };

  const schedule = (entry: Entry<Context>) => {
    const wanted = [...entry.watchers].map((watcher) => watcher.intervalSeconds).filter((seconds) => seconds > 0);
    const seconds = wanted.length > 0 ? Math.min(...wanted) : 0;
    if (seconds === entry.timerSeconds) return;
    if (entry.timer) clearInterval(entry.timer);
    entry.timer = seconds > 0 ? setInterval(() => run(entry, false), seconds * 1000) : null;
    entry.timerSeconds = seconds;
  };

  return {
    watch({ workspaceId, intervalSeconds, context, push, signal }) {
      if (signal.aborted) return;
      let entry = entries.get(workspaceId);
      if (!entry) {
        entry = {
          workspaceId,
          watchers: new Set(),
          context,
          last: null,
          lastJson: null,
          running: false,
          forceQueued: false,
          finishedAt: 0,
          timer: null,
          timerSeconds: 0,
        };
        entries.set(workspaceId, entry);
      }
      const current = entry;
      current.context = context;
      const watcher: Watcher = { intervalSeconds, push };
      current.watchers.add(watcher);
      if (current.last) send(watcher, current.last);
      else run(current, false);
      schedule(current);

      signal.addEventListener(
        "abort",
        () => {
          current.watchers.delete(watcher);
          if (current.watchers.size > 0) {
            schedule(current);
            return;
          }
          if (current.timer) clearInterval(current.timer);
          if (entries.get(workspaceId) === current) entries.delete(workspaceId);
        },
        { once: true },
      );
    },

    refresh(workspaceIds, force) {
      let started = 0;
      for (const workspaceId of new Set(workspaceIds)) {
        const entry = entries.get(workspaceId);
        if (!entry) continue;
        if (!force && (entry.running || now() - entry.finishedAt < minGapMs)) continue;
        run(entry, force);
        started += 1;
      }
      return started;
    },
  };
}
