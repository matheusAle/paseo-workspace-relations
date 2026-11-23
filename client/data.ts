import { useEffect, useMemo, useState } from "react";
import {
  getPaseoClient,
  useAgents,
  useHosts,
  usePaseo,
  useWorkspaces,
  type PluginPaseoApi,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";

/**
 * The daemon's full workspace descriptor, reached through the SDK. Importing it from
 * @getpaseo/client would need that package installed, which a Git install doesn't do.
 */
export type PaseoWorkspace = NonNullable<ReturnType<ReturnType<PluginPaseoApi["workspaces"]["ref"]>["current"]>>;

/**
 * The daemon's full workspace descriptor: PR runtime (number, state, checks, mergeable), services,
 * git runtime. The plugin snapshot doesn't carry these, so each row reads its own descriptor.
 */
export function useWorkspaceDescriptor(ref: WorkspaceRef): PaseoWorkspace | null {
  const paseo = usePaseo();
  const online = useHosts().some((host) => host.serverId === ref.hostId && host.status === "online");
  // A handle can't be made for a disconnected host; try again when it comes back.
  const handle = useMemo(() => {
    if (!online) return null;
    try {
      return paseo.workspaces.ref(ref);
    } catch {
      return null;
    }
  }, [paseo, ref.key, online]);
  const [descriptor, setDescriptor] = useState<PaseoWorkspace | null>(() => handle?.current() ?? null);

  useEffect(() => {
    if (!handle) return;
    let alive = true;
    const unsubscribe = handle.subscribe(() => {
      if (alive) setDescriptor(handle.current());
    });
    handle
      .refresh()
      .then((next) => {
        if (alive) setDescriptor(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [handle]);

  return descriptor;
}

const ROOT = "__root__";

function hostWorkspaceId(hostId: string, workspaceId: string): string {
  return `${hostId}\u0000${workspaceId}`;
}

function useOnlineHostIds(): string[] {
  const hosts = useHosts();
  const joined = hosts
    .filter((host) => host.status === "online")
    .map((host) => host.serverId)
    .join("\u0000");
  return useMemo(() => (joined ? joined.split("\u0000") : []), [joined]);
}

/**
 * hostId+workspaceId -> the workspace that created it. The daemon records this on the workspace
 * itself when an agent creates one, but the plugin snapshot doesn't carry it, so read each host's
 * workspace list once and follow its updates.
 */
function useRecordedParents(): ReadonlyMap<string, string> {
  const serverIds = useOnlineHostIds();
  const [parents, setParents] = useState<ReadonlyMap<string, string>>(() => new Map());

  useEffect(() => {
    let alive = true;
    const unsubscribers: (() => void)[] = [];
    const record = (serverId: string, workspace: PaseoWorkspace) => {
      const key = hostWorkspaceId(serverId, workspace.id);
      setParents((current) => {
        const parent = workspace.parentWorkspaceId;
        if (parent ? current.get(key) === parent : !current.has(key)) return current;
        const next = new Map(current);
        if (parent) next.set(key, parent);
        else next.delete(key);
        return next;
      });
    };

    for (const serverId of serverIds) {
      let api: ReturnType<typeof getPaseoClient>;
      try {
        api = getPaseoClient(serverId);
      } catch {
        // The host dropped between the host list and this effect; its next status change reruns it.
        continue;
      }
      unsubscribers.push(
        api.workspaces.subscribe((update) => {
          if (alive && update.kind === "upsert") record(serverId, update.workspace);
        }),
      );
      void (async () => {
        let cursor: string | undefined;
        for (let page = 0; page < 20; page += 1) {
          const result = await api.workspaces.list({ includeBackground: true, page: { limit: 200, cursor } });
          if (!alive) return;
          for (const workspace of result.entries) record(serverId, workspace);
          if (!result.pageInfo.hasMore || !result.pageInfo.nextCursor) return;
          cursor = result.pageInfo.nextCursor;
        }
      })().catch(() => {});
    }
    return () => {
      alive = false;
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [serverIds]);

  return parents;
}

/**
 * Workspace key -> parent workspace key. The workspace's recorded creator wins; otherwise fall back
 * to its parent agent's workspace, found with two grouped queries standing in for a bulk read.
 */
export function useParentWorkspaces(): ReadonlyMap<string, string> {
  const recorded = useRecordedParents();
  const allWorkspaces = useWorkspaces();
  const byParentAgent = useWorkspaces({
    groupBy: (workspace) => workspace.parentAgent?.key ?? ROOT,
  });
  const agentsByWorkspace = useAgents({ groupBy: (agent) => agent.workspace.key });

  return useMemo(() => {
    const keyOf = new Map<string, string>();
    for (const ref of allWorkspaces) keyOf.set(hostWorkspaceId(ref.hostId, ref.id), ref.key);

    const parentOf = new Map<string, string>();
    const workspaceOfAgent = new Map<string, string>();
    for (const group of agentsByWorkspace) {
      for (const agent of group.items) workspaceOfAgent.set(agent.key, group.key);
    }
    for (const group of byParentAgent) {
      if (group.key === ROOT) continue;
      const parentWorkspace = workspaceOfAgent.get(group.key);
      if (!parentWorkspace) continue;
      for (const workspace of group.items) {
        if (workspace.key !== parentWorkspace) parentOf.set(workspace.key, parentWorkspace);
      }
    }
    for (const ref of allWorkspaces) {
      const parentId = recorded.get(hostWorkspaceId(ref.hostId, ref.id));
      const parentKey = parentId ? keyOf.get(hostWorkspaceId(ref.hostId, parentId)) : undefined;
      if (parentKey && parentKey !== ref.key) parentOf.set(ref.key, parentKey);
    }
    return parentOf;
  }, [recorded, allWorkspaces, byParentAgent, agentsByWorkspace]);
}

export function projectKeyId(hostId: string, projectId: string): string {
  return `${hostId}\u0000${projectId}`;
}

/**
 * hostId+projectId -> the project's shared key, which the app hashes for avatar colors and uses
 * to identify the project in its sidebar order. Null until every online host has answered.
 */
export function useProjectKeys(): ReadonlyMap<string, string> | null {
  const serverIds = useOnlineHostIds();
  const [keys, setKeys] = useState<ReadonlyMap<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all(
      serverIds.map(async (serverId) => {
        try {
          const result = await getPaseoClient(serverId).projects.list();
          return result.projects.map(
            (project) => [projectKeyId(serverId, project.projectId), project.projectKey ?? ""] as const,
          );
        } catch {
          return [];
        }
      }),
    ).then((entries) => {
      if (!alive) return;
      setKeys(new Map(entries.flat().filter(([, key]) => key)));
    });
    return () => {
      alive = false;
    };
  }, [serverIds]);

  return keys;
}

export type ChecksState = "passed" | "failed" | "running" | "none";

type PullRequest = NonNullable<NonNullable<PaseoWorkspace["githubRuntime"]>["pullRequest"]>;

export function pullRequestOf(descriptor: PaseoWorkspace | null): PullRequest | null {
  return descriptor?.githubRuntime?.pullRequest ?? null;
}

export function checksStateOf(pullRequest: PullRequest | null): ChecksState {
  if (!pullRequest) return "none";
  const checks = pullRequest.checks ?? [];
  if (checks.some((check) => check.status === "failure")) return "failed";
  if (checks.some((check) => check.status === "pending")) return "running";
  if (checks.some((check) => check.status === "success")) return "passed";
  if (pullRequest.checksStatus === "failure") return "failed";
  if (pullRequest.checksStatus === "pending") return "running";
  if (pullRequest.checksStatus === "success") return "passed";
  return "none";
}

export interface CheckCounts {
  readonly success: number;
  readonly failure: number;
  readonly pending: number;
}

export function checkCountsOf(pullRequest: PullRequest | null): CheckCounts {
  const counts = { success: 0, failure: 0, pending: 0 };
  for (const check of pullRequest?.checks ?? []) {
    if (check.status === "success") counts.success += 1;
    else if (check.status === "failure") counts.failure += 1;
    else if (check.status === "pending") counts.pending += 1;
  }
  return counts;
}

export type PullRequestState = "draft" | "open" | "merged" | "closed";

export function pullRequestStateOf(pullRequest: PullRequest): PullRequestState {
  if (pullRequest.isMerged || pullRequest.state.toLowerCase() === "merged") return "merged";
  if (pullRequest.state.toLowerCase() !== "open") return "closed";
  return pullRequest.isDraft ? "draft" : "open";
}

export function pullRequestNumberOf(pullRequest: PullRequest): number | null {
  if (pullRequest.number !== undefined) return pullRequest.number;
  const match = /\/(?:pull|pulls|merge_requests)\/(\d+)/.exec(pullRequest.url);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** The service the app's sidebar shows: an unhealthy running one first, else the first running. */
export function primaryServiceOf(
  descriptor: PaseoWorkspace | null,
): { name: string; healthy: boolean } | null {
  const running = (descriptor?.scripts ?? []).filter(
    (script) => script.type === "service" && script.lifecycle === "running",
  );
  const unhealthy = running.find((script) => script.health === "unhealthy");
  const chosen = unhealthy ?? running[0];
  return chosen ? { name: chosen.scriptName, healthy: chosen !== unhealthy } : null;
}
