import { ServiceProvider, WidgetDefinition, OAuthConfig } from "./types";
import { fetchJson, ExternalApiError } from "../lib/httpClient";

// GitHub service: commits and issues of a repository behind a single OAuth link.
const GITHUB_API = "https://api.github.com";

/*
 The permissions asked of the user. "repo" is needed to read private
 repositories as well; "read:user" identifies the account.
 */
const SCOPES = ["read:user", "repo"].join(" ");

function getOAuthConfig(): OAuthConfig {
  return {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GITHUB_REDIRECT_URI ?? "http://localhost:8080/oauth/github/callback",
    scope: SCOPES,
    /*
     GitHub OAuth Apps issue tokens that never expire and no refresh token:
     no access_type / prompt equivalent is needed. allow_signup=false keeps
     the consent screen from offering to create a GitHub account.
     */
    extraAuthorizationParams: {
      allow_signup: "false",
    },
  };
}

/* Headers GitHub expects on every API call */
function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // GitHub rejects requests without a User-Agent
    "User-Agent": "epitech-dashboard",
  };
}

// Shapes returned by the GitHub API

interface RepositoryResponse {
  full_name: string;
  default_branch: string;
}

interface CommitResponse {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string } | null;
    committer?: { date?: string } | null;
  };
  /* null when the commit email matches no GitHub account */
  author?: { login: string } | null;
}

interface IssueResponse {
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  comments: number;
  updated_at: string;
  user?: { login: string } | null;
  labels?: Array<{ name: string; color: string } | string>;
  /* Present only when the "issue" is in fact a pull request */
  pull_request?: unknown;
}

// Parameter validation

const MAX_ITEMS = 20;
const DEFAULT_ITEMS = 5;
const ISSUE_STATES = ["open", "closed", "all"] as const;
type IssueState = (typeof ISSUE_STATES)[number];

/* Same rules as the Google widgets, so every "count" behaves the same */
function readCountParam(params: Record<string, string | number>): number {
  const count = Number(params.count ?? DEFAULT_ITEMS);

  if (!Number.isInteger(count) || count < 1) {
    throw new ExternalApiError("rejected", "Le paramètre « count » doit être un entier positif");
  }
  if (count > MAX_ITEMS) {
    throw new ExternalApiError("rejected", `Maximum ${MAX_ITEMS} éléments par widget`);
  }
  return count;
}

/*
 "owner/name", as shown in the repository URL. Each part is checked against
 the characters GitHub allows, so nothing else can slip into the API path.
 */
function readRepoParam(params: Record<string, string | number>): { owner: string; name: string } {
  /*
   Users naturally paste the repository URL: "https://github.com/owner/name",
   "github.com/owner/name/tree/main", "git@github.com:owner/name.git"...
   Everything around "owner/name" is stripped before checking it.
   */
  const repo = String(params.repo ?? "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/[?#].*$/, "")
    .split("/")
    .slice(0, 2)
    .join("/")
    .replace(/\.git$/i, "");
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(repo);

  if (!match) {
    throw new ExternalApiError(
      "rejected",
      "Le paramètre « repo » doit être de la forme « propriétaire/dépôt »"
    );
  }
  return { owner: match[1], name: match[2] };
}

/* Optional string param: an empty value means "not set" */
function readOptionalString(params: Record<string, string | number>, name: string): string | null {
  const value = String(params[name] ?? "").trim();
  return value.length > 0 ? value : null;
}

function readStateParam(params: Record<string, string | number>): IssueState {
  const state = (readOptionalString(params, "state") ?? "open").toLowerCase();

  if (!(ISSUE_STATES as readonly string[]).includes(state)) {
    throw new ExternalApiError(
      "rejected",
      "Le paramètre « state » doit valoir « open », « closed » ou « all »"
    );
  }
  return state as IssueState;
}

function requireToken(token: string | undefined): string {
  if (!token) {
    throw new ExternalApiError("rejected", "Compte GitHub non lié");
  }
  return token;
}

function repoPath(repo: { owner: string; name: string }): string {
  return `${GITHUB_API}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

// Widgets

const commits: WidgetDefinition = {
  name: "github_commits",
  description: "Affiche les N derniers commits d'une branche d'un dépôt",
  params: [
    { name: "repo", type: "string" },
    { name: "branch", type: "string" },
    { name: "count", type: "integer" },
  ],

  async fetch(params, token) {
    const repo = readRepoParam(params);
    const count = readCountParam(params);
    const accessToken = requireToken(token);
    const headers = githubHeaders(accessToken);

    /*
     An empty branch means the repository's default branch. Asking for it
     explicitly (rather than omitting `sha`) lets the widget display which
     branch it is showing.
     */
    let branch = readOptionalString(params, "branch");
    if (!branch) {
      const repository = await fetchJson<RepositoryResponse>(repoPath(repo), { headers });
      branch = repository.default_branch;
    }

    const url =
      `${repoPath(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=${count}`;
    const response = await fetchJson<CommitResponse[]>(url, { headers });

    /*
     Shaped for the generic WidgetDataView: each commit is a row whose
     headline is "message", the other fields are shown under it, and "url"
     becomes an "Ouvrir" link. No avatar URL: it would render as a second link.
     */
    return {
      repo: `${repo.owner}/${repo.name}`,
      branch,
      commits: response.map((item) => ({
        // Only the summary line: the body of a commit message can be long
        message: item.commit.message.split("\n")[0],
        sha: item.sha.slice(0, 7),
        // The GitHub login when the email is linked to an account, the git
        // author name otherwise
        author: item.author?.login ?? item.commit.author?.name ?? "inconnu",
        date: item.commit.author?.date ?? item.commit.committer?.date ?? null,
        url: item.html_url,
      })),
    };
  },
};

const issues: WidgetDefinition = {
  name: "github_issues",
  description: "Affiche les N dernières issues d'un dépôt, filtrées par état et par labels",
  params: [
    { name: "repo", type: "string" },
    { name: "state", type: "string" },
    { name: "labels", type: "string" },
    { name: "count", type: "integer" },
  ],

  async fetch(params, token) {
    const repo = readRepoParam(params);
    const state = readStateParam(params);
    const count = readCountParam(params);
    const accessToken = requireToken(token);

    // "bug, urgent" → "bug,urgent": GitHub keeps issues carrying ALL the labels
    const labels = (readOptionalString(params, "labels") ?? "")
      .split(",")
      .map((label) => label.trim())
      .filter((label) => label.length > 0)
      .join(",");

    /*
     The issues endpoint also returns pull requests. Asking for three times
     as many items leaves enough real issues after filtering them out in a
     repository with many PRs, without paginating.
     */
    const query = new URLSearchParams({
      state,
      sort: "updated",
      direction: "desc",
      per_page: String(Math.min(100, count * 3)),
    });
    if (labels) {
      query.set("labels", labels);
    }

    const response = await fetchJson<IssueResponse[]>(`${repoPath(repo)}/issues?${query}`, {
      headers: githubHeaders(accessToken),
    });

    const realIssues = response.filter((item) => !item.pull_request).slice(0, count);

    /*
     Shaped for the generic WidgetDataView: each issue is a row whose
     headline is "title". Labels are flattened to one string, since a list
     of objects inside a row would render as "[object Object]"; an empty
     string is hidden by the view.
     */
    return {
      repo: `${repo.owner}/${repo.name}`,
      state,
      labels: labels || null,
      issues: realIssues.map((item) => ({
        title: item.title,
        number: item.number,
        state: item.state,
        author: item.user?.login ?? "inconnu",
        // Labels can come back as plain strings on old issues
        labels: (item.labels ?? [])
          .map((label) => (typeof label === "string" ? label : label.name))
          .join(", "),
        comments: item.comments,
        updatedAt: item.updated_at,
        url: item.html_url,
      })),
    };
  },
};

export const githubService: ServiceProvider = {
  name: "github",
  requiresAuth: true,
  getOAuthConfig,
  widgets: [commits, issues],
};
