import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrStatusEvent } from "../shared/pr-status";
import { createPrStatusHub } from "./pr-status-hub";

const OPEN: PrStatusEvent = {
  found: true,
  forge: "github",
  number: 7,
  url: "https://github.com/acme/app/pull/7",
  state: "open",
  mergeable: "mergeable",
  approvalsGiven: 1,
  approvalsRequired: 2,
};
const APPROVED: PrStatusEvent = { ...OPEN, approvalsGiven: 2 };

function fakeResolve(events: PrStatusEvent[] = [OPEN]) {
  const calls: { workspaceId: string; force: boolean }[] = [];
  const resolve = vi.fn(async (workspaceId: string, _context: null, force: boolean) => {
    calls.push({ workspaceId, force });
    return events[Math.min(calls.length - 1, events.length - 1)];
  });
  return { resolve, calls };
}

function watcher() {
  const received: PrStatusEvent[] = [];
  const controller = new AbortController();
  return { received, controller, push: (event: PrStatusEvent) => received.push(event) };
}

async function settle() {
  // Let the fetch promise and the push hop run.
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("createPrStatusHub", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fetches once on the first watch and shares the result with later watchers", async () => {
    const { resolve, calls } = fakeResolve();
    const hub = createPrStatusHub(resolve);
    const row = watcher();
    const card = watcher();

    hub.watch({ workspaceId: "w1", intervalSeconds: 60, context: null, push: row.push, signal: row.controller.signal });
    await settle();
    hub.watch({ workspaceId: "w1", intervalSeconds: 60, context: null, push: card.push, signal: card.controller.signal });
    await settle();

    expect(calls).toEqual([{ workspaceId: "w1", force: false }]);
    expect(row.received).toEqual([OPEN]);
    expect(card.received).toEqual([OPEN]);
  });

  it("polls at the shortest interval any watcher asks for, and pushes only changes", async () => {
    const { resolve, calls } = fakeResolve([OPEN, OPEN, APPROVED]);
    const hub = createPrStatusHub(resolve);
    const slow = watcher();
    const fast = watcher();
    hub.watch({ workspaceId: "w1", intervalSeconds: 300, context: null, push: slow.push, signal: slow.controller.signal });
    hub.watch({ workspaceId: "w1", intervalSeconds: 30, context: null, push: fast.push, signal: fast.controller.signal });
    await settle();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toHaveLength(2);
    expect(fast.received).toEqual([OPEN]);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toHaveLength(3);
    expect(fast.received).toEqual([OPEN, APPROVED]);
    expect(slow.received).toEqual([OPEN, APPROVED]);
  });

  it("with only manual watchers, fetches on watch and on request but never on a timer", async () => {
    const { resolve, calls } = fakeResolve();
    const hub = createPrStatusHub(resolve);
    const row = watcher();
    hub.watch({ workspaceId: "w1", intervalSeconds: 0, context: null, push: row.push, signal: row.controller.signal });
    await settle();

    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(calls).toHaveLength(1);

    expect(hub.refresh(["w1"], true)).toBe(1);
    await settle();
    expect(calls).toEqual([
      { workspaceId: "w1", force: false },
      { workspaceId: "w1", force: true },
    ]);
  });

  it("drops a gentle refresh right after a fetch, but always runs a forced one", async () => {
    let clock = 1_000_000;
    const { resolve, calls } = fakeResolve();
    const hub = createPrStatusHub(resolve, { minGapMs: 5_000, now: () => clock });
    const row = watcher();
    hub.watch({ workspaceId: "w1", intervalSeconds: 0, context: null, push: row.push, signal: row.controller.signal });
    await settle();

    expect(hub.refresh(["w1"], false)).toBe(0);
    expect(hub.refresh(["w1"], true)).toBe(1);
    await settle();
    clock += 6_000;
    expect(hub.refresh(["w1"], false)).toBe(1);
    await settle();
    expect(calls.map((call) => call.force)).toEqual([false, true, false]);
  });

  it("ignores refreshes for workspaces nobody watches", () => {
    const { resolve } = fakeResolve();
    const hub = createPrStatusHub(resolve);
    expect(hub.refresh(["unwatched"], true)).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("stops polling when the last watcher leaves", async () => {
    const { resolve, calls } = fakeResolve();
    const hub = createPrStatusHub(resolve);
    const row = watcher();
    hub.watch({ workspaceId: "w1", intervalSeconds: 60, context: null, push: row.push, signal: row.controller.signal });
    await settle();

    row.controller.abort();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(calls).toHaveLength(1);
    expect(hub.refresh(["w1"], true)).toBe(0);
  });
});
