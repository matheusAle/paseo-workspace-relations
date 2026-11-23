import { execCommand } from "@getpaseo/plugin/server";
import type { PluginSubscriptionContext } from "@getpaseo/plugin/server";
import type { PrStatusEvent } from "../shared/pr-status";

const POLL_INTERVAL_MS = 60_000;
const NOT_FOUND: PrStatusEvent = { found: false };

export function watchPrStatus(
  input: { workspaceId: string },
  context: PluginSubscriptionContext<PrStatusEvent>,
): void {
  // Stay synchronous: a handler that returns a promise closes the subscription when it settles.
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  context.signal.addEventListener(
    "abort",
    () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
    { once: true },
  );

  void (async () => {
    // A fresh handle knows nothing until refreshed; its directory reads null before that.
    const workspace = await context.paseo.workspaces
      .ref(input.workspaceId)
      .refresh()
      .catch(() => null);
    const directory = workspace?.workspaceDirectory ?? null;
    if (stopped) return;
    if (!directory) {
      await context.push(NOT_FOUND);
      return;
    }
    const poll = async () => {
      if (stopped) return;
      const event = await resolvePrStatus(directory);
      if (!stopped) await context.push(event);
    };
    await poll();
    if (!stopped) timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  })();
}

async function resolvePrStatus(cwd: string): Promise<PrStatusEvent> {
  const forge = await detectForge(cwd);
  try {
    if (forge === "github") return await fetchGithubStatus(cwd);
    if (forge === "gitlab") return await fetchGitlabStatus(cwd);
  } catch {
    // No PR for this branch, or the CLI isn't authenticated — show nothing rather than an error.
  }
  return NOT_FOUND;
}

async function detectForge(cwd: string): Promise<"github" | "gitlab" | null> {
  try {
    const { stdout } = await execCommand("git", ["remote", "get-url", "origin"], {
      cwd,
      timeout: 5_000,
    });
    const url = stdout.trim();
    if (/github\.com/i.test(url)) return "github";
    if (/gitlab\.com/i.test(url)) return "gitlab";
    return null;
  } catch {
    return null;
  }
}

interface GithubReview {
  author: { login: string } | null;
  state: string;
  submittedAt: string;
}

interface GithubPrView {
  number: number;
  url: string;
  state: string;
  isDraft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  reviews: GithubReview[];
  headRepositoryOwner?: { login: string };
  headRefName: string;
  baseRefName: string;
}

function countGithubApprovals(reviews: GithubReview[]): number {
  const latestByAuthor = new Map<string, GithubReview>();
  for (const review of reviews) {
    const author = review.author?.login;
    if (!author) continue;
    const existing = latestByAuthor.get(author);
    if (!existing || review.submittedAt > existing.submittedAt) {
      latestByAuthor.set(author, review);
    }
  }
  let approved = 0;
  for (const review of latestByAuthor.values()) {
    if (review.state === "APPROVED") approved += 1;
  }
  return approved;
}

async function fetchGithubRequiredApprovals(cwd: string, baseRefName: string): Promise<number | null> {
  try {
    const { stdout } = await execCommand(
      "gh",
      ["api", `repos/{owner}/{repo}/branches/${encodeURIComponent(baseRefName)}/protection/required_pull_request_reviews`],
      { cwd, timeout: 10_000 },
    );
    const parsed = JSON.parse(stdout) as { required_approving_review_count?: number };
    return parsed.required_approving_review_count ?? null;
    // `gh api` resolves {owner}/{repo} against the cwd's remote, so no extra lookup is needed.
  } catch {
    // Branch protection is usually only readable by repo admins; absence isn't an error.
    return null;
  }
}

async function fetchGithubStatus(cwd: string): Promise<PrStatusEvent> {
  const { stdout } = await execCommand(
    "gh",
    ["pr", "view", "--json", "number,url,state,isDraft,mergeable,reviews,baseRefName"],
    { cwd, timeout: 15_000 },
  );
  const view = JSON.parse(stdout) as GithubPrView;

  const resolvedState =
    view.state === "MERGED" ? "merged" : view.state === "CLOSED" ? "closed" : view.isDraft ? "draft" : "open";
  const mergeable =
    view.mergeable === "MERGEABLE" ? "mergeable" : view.mergeable === "CONFLICTING" ? "conflicting" : "unknown";

  return {
    found: true,
    forge: "github",
    number: view.number,
    url: view.url,
    state: resolvedState,
    mergeable,
    approvalsGiven: countGithubApprovals(view.reviews ?? []),
    approvalsRequired: await fetchGithubRequiredApprovals(cwd, view.baseRefName),
  };
}

interface GitlabMrView {
  iid: number;
  web_url: string;
  state: string;
  draft: boolean;
  detailed_merge_status?: string;
  has_conflicts?: boolean;
  project_id: number;
}

interface GitlabApprovals {
  approvals_required?: number;
  approved_by?: unknown[];
}

async function fetchGitlabStatus(cwd: string): Promise<PrStatusEvent> {
  const { stdout } = await execCommand("glab", ["mr", "view", "--output", "json"], {
    cwd,
    timeout: 15_000,
  });
  const view = JSON.parse(stdout) as GitlabMrView;

  const resolvedState =
    view.state === "merged" ? "merged" : view.state === "closed" ? "closed" : view.draft ? "draft" : "open";
  const mergeable =
    view.detailed_merge_status === "mergeable" ? "mergeable" : view.has_conflicts ? "conflicting" : "unknown";

  let approvalsGiven = 0;
  let approvalsRequired: number | null = null;
  try {
    const { stdout: approvalsOut } = await execCommand(
      "glab",
      ["api", `projects/${view.project_id}/merge_requests/${view.iid}/approvals`],
      { cwd, timeout: 10_000 },
    );
    const approvals = JSON.parse(approvalsOut) as GitlabApprovals;
    approvalsRequired = typeof approvals.approvals_required === "number" ? approvals.approvals_required : null;
    approvalsGiven = Array.isArray(approvals.approved_by) ? approvals.approved_by.length : 0;
  } catch {
    // Approvals API can 404 on older self-managed instances; show the MR without a count.
  }

  return {
    found: true,
    forge: "gitlab",
    number: view.iid,
    url: view.web_url,
    state: resolvedState,
    mergeable,
    approvalsGiven,
    approvalsRequired,
  };
}
