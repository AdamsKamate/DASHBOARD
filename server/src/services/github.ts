import { ServiceProvider, WidgetDefinition, WidgetParam, OAuthConfig } from "./types";
import { fetchJson, ExternalApiError } from "../lib/httpClient";

// GitHub service: commits, issues, pull requests, releases and statistics of
// a repository, behind a single OAuth link.
// GitHub service: commits and issues of a repository behind a single OAuth link
const GITHUB_API = "https://api.github.com";

/*
 The permissions asked of the user. "repo" is needed to read private
 repositories as well; "read:user" identifies the account
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
    // GitHub rejects requests without a User Agent
    "User-Agent": "epitech-dashboard",
  };
}

// Shapes returned by the GitHub API

interface RepositoryResponse {
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  subscribers_count?: number;
  /* Counts open issues AND open pull requests */
  open_issues_count: number;
  language: string | null;
  license?: { name: string } | null;
  pushed_at: string;
  private: boolean;
  archived: boolean;
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
  created_at: string;
  updated_at: string;
  user?: { login: string } | null;
  assignees?: Array<{ login: string }> | null;
  labels?: Array<{ name: string } | string>;
  /* Present only when the "issue" is in fact a pull request */
  pull_request?: unknown;
}

interface PullRequestResponse {
  number: number;
  title: string;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  html_url: string;
  updated_at: string;
  user?: { login: string } | null;
  head: { ref: string };
  base: { ref: string };
}

interface ReleaseResponse {
  name: string | null;
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  author?: { login: string } | null;
}

// Parameters shared by every widget

const MAX_ITEMS = 20;
const DEFAULT_ITEMS = 5;

type Params = Record<string, string | number>;

const REPO_PARAM: WidgetParam = {
  name: "repo",
  type: "string",
  label: "Dépôt",
  required: true,
  placeholder: "propriétaire/dépôt ou lien GitHub",
  help: "Par exemple pixelomomo/HMI_Sys_monitor, ou l'URL du dépôt.",
};

const COUNT_PARAM: WidgetParam = {
  name: "count",
  type: "integer",
  label: "Nombre d'éléments",
  default: DEFAULT_ITEMS,
  min: 1,
  max: MAX_ITEMS,
};

// Parameter reading. An empty value always means "no filter".

/* Same rules as the Google widgets, so every "count" behaves the same */
function readCountParam(params: Params): number {
  const raw = params.count;
  const count = raw === undefined || raw === "" ? DEFAULT_ITEMS : Number(raw);

  if (!Number.isInteger(count) || count < 1) {
    throw new ExternalApiError("rejected", "Le paramètre « count » doit être un entier positif");
  }
  if (count > MAX_ITEMS) {
    throw new ExternalApiError("rejected", `Maximum ${MAX_ITEMS} éléments par widget`);
  }
  return count;
}

/*
 "owner/name", as shown in the repository URL
 */
function readRepoParam(params: Params): { owner: string; name: string } {
  /*
   Users naturally paste the repository URL: "https://github.com/owner/name",
   "github.com/owner/name/tree/main", "git@github.com:owner/name.git"...
   Everything around "owner/name" is stripped before checking it
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
function readOptionalString(params: Params, name: string): string | null {
  const value = String(params[name] ?? "").trim();
  return value.length > 0 ? value : null;
}

/*
 A param restricted to the values of its `options`. Empty means `fallback`,
 which is the "all" value of the filter.
 */
function readChoice(params: Params, param: WidgetParam, fallback: string): string {
  const value = (readOptionalString(params, param.name) ?? fallback).toLowerCase();
  const allowed = (param.options ?? []).map((option) => option.value);

  if (value !== fallback && !allowed.includes(value)) {
    throw new ExternalApiError(
      "rejected",
      `Le paramètre « ${param.name} » doit valoir ${allowed.map((v) => `« ${v} »`).join(", ")} ou rester vide`
    );
  }
  return value;
}

/* "bug, urgent" → "bug,urgent"; null when no label is given */
function readLabelsParam(params: Params): string | null {
  const labels = (readOptionalString(params, "labels") ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
  return labels.length > 0 ? labels.join(",") : null;
}

/* A GitHub login, with or without its "@" */
function readLoginParam(params: Params, name: string): string | null {
  const login = readOptionalString(params, name)?.replace(/^@/, "") ?? null;
  if (login !== null && !/^[A-Za-z0-9-]+$/.test(login)) {
    throw new ExternalApiError("rejected", `Le paramètre « ${name} » n'est pas un identifiant GitHub valide`);
  }
  return login;
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

function repoLabel(repo: { owner: string; name: string }): string {
  return `${repo.owner}/${repo.name}`;
}

/*
 Every widget returns data shaped for the generic WidgetDataView: lists are
 arrays of flat records whose headline is "title" or "message", a "url" field
 becomes an "Ouvrir" link, and empty strings or nulls are hidden.
 */

// github_commits

const COMMITS_SINCE_PARAM: WidgetParam = {
  name: "since",
  type: "string",
  label: "Période",
  emptyLabel: "Tout l'historique",
  options: [
    { value: "1", label: "Dernières 24 h" },
    { value: "7", label: "7 derniers jours" },
    { value: "30", label: "30 derniers jours" },
    { value: "90", label: "90 derniers jours" },
  ],
};

const commits: WidgetDefinition = {
  name: "github_commits",
  description: "Affiche les derniers commits d'une branche, filtrés par auteur et par période",
  params: [
    REPO_PARAM,
    {
      name: "branch",
      type: "string",
      label: "Branche",
      placeholder: "main",
      emptyLabel: "Branche par défaut du dépôt",
    },
    {
      name: "author",
      type: "string",
      label: "Auteur",
      placeholder: "identifiant GitHub",
      emptyLabel: "Tous les auteurs",
    },
    COMMITS_SINCE_PARAM,
    COUNT_PARAM,
  ],

  async fetch(params, token) {
    const repo = readRepoParam(params);
    const count = readCountParam(params);
    const author = readLoginParam(params, "author");
    const sinceDays = readChoice(params, COMMITS_SINCE_PARAM, "");
    const headers = githubHeaders(requireToken(token));

    /*
     An empty branch means the repository's default branch
     */
    let branch = readOptionalString(params, "branch");
    if (!branch) {
      const repository = await fetchJson<RepositoryResponse>(repoPath(repo), { headers });
      branch = repository.default_branch;
    }

    const query = new URLSearchParams({ sha: branch, per_page: String(count) });
    if (author) {
      query.set("author", author);
    }
    if (sinceDays) {
      const since = new Date(Date.now() - Number(sinceDays) * 86_400_000);
      query.set("since", since.toISOString());
    }

    const response = await fetchJson<CommitResponse[]>(`${repoPath(repo)}/commits?${query}`, {
      headers,
    });

    /*
     Shaped for the generic WidgetDataView: each commit is a row whose
     headline is "message", the other fields are shown under it, and "url"
     becomes an "Ouvrir" link. No avatar URL: it would render as a second link
     */
    return {
      repo: repoLabel(repo),
      branch,
      author: author ?? "",
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

// github_issues

/* Shared by issues and pull requests: empty means both states */
const STATE_PARAM: WidgetParam = {
  name: "state",
  type: "string",
  label: "État",
  emptyLabel: "Tous les états",
  options: [
    { value: "open", label: "Ouvertes" },
    { value: "closed", label: "Fermées" },
  ],
};

const ISSUES_SORT_PARAM: WidgetParam = {
  name: "sort",
  type: "string",
  label: "Trier par",
  default: "updated",
  options: [
    { value: "updated", label: "Dernière activité" },
    { value: "created", label: "Date de création" },
    { value: "comments", label: "Nombre de commentaires" },
  ],
};

const issues: WidgetDefinition = {
  name: "github_issues",
  description: "Affiche les issues d'un dépôt, filtrées par état, labels et personne assignée",
  params: [
    REPO_PARAM,
    STATE_PARAM,
    {
      name: "labels",
      type: "string",
      label: "Labels",
      placeholder: "bug, urgent",
      emptyLabel: "Tous les labels",
      help: "Séparés par des virgules. Seules les issues portant tous ces labels sont affichées.",
    },
    {
      name: "assignee",
      type: "string",
      label: "Assignée à",
      placeholder: "identifiant GitHub",
      emptyLabel: "Tout le monde",
    },
    ISSUES_SORT_PARAM,
    COUNT_PARAM,
  ],

  async fetch(params, token) {
    const repo = readRepoParam(params);
    const state = readChoice(params, STATE_PARAM, "all");
    const labels = readLabelsParam(params);
    const assignee = readLoginParam(params, "assignee");
    const sort = readChoice(params, ISSUES_SORT_PARAM, "updated");
    const count = readCountParam(params);
    const accessToken = requireToken(token);

    // "bug, urgent" "bug,urgent": GitHub keeps issues carrying ALL the labels
    const labels = (readOptionalString(params, "labels") ?? "")
      .split(",")
      .map((label) => label.trim())
      .filter((label) => label.length > 0)
      .join(",");

    /*
     The issues endpoint also returns pull requests
     */
    const query = new URLSearchParams({
      state,
      sort,
      direction: "desc",
      per_page: String(Math.min(100, count * 3)),
    });
    if (labels) {
      query.set("labels", labels);
    }
    if (assignee) {
      query.set("assignee", assignee);
    }

    const response = await fetchJson<IssueResponse[]>(`${repoPath(repo)}/issues?${query}`, {
      headers: githubHeaders(requireToken(token)),
    });

    const realIssues = response.filter((item) => !item.pull_request).slice(0, count);

    /*
     Shaped for the generic WidgetDataView: each issue is a row whose
     headline is "title".
     */
    return {
      repo: repoLabel(repo),
      issues: realIssues.map((item) => ({
        title: item.title,
        number: item.number,
        state: item.state === "open" ? "ouverte" : "fermée",
        author: item.user?.login ?? "inconnu",
        assignees: (item.assignees ?? []).map((user) => user.login).join(", "),
        // Labels can come back as plain strings on old issues. Flattened to
        // one string: a list of objects inside a row renders as
        // "[object Object]"
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

// github_pull_requests

const PULLS_SORT_PARAM: WidgetParam = {
  name: "sort",
  type: "string",
  label: "Trier par",
  default: "updated",
  options: [
    { value: "updated", label: "Dernière activité" },
    { value: "created", label: "Date de création" },
    { value: "popularity", label: "Nombre de commentaires" },
    { value: "long-running", label: "Ouvertes depuis le plus longtemps" },
  ],
};

const pullRequests: WidgetDefinition = {
  name: "github_pull_requests",
  description: "Affiche les pull requests d'un dépôt, filtrées par état et branche cible",
  params: [
    REPO_PARAM,
    STATE_PARAM,
    {
      name: "base",
      type: "string",
      label: "Branche cible",
      placeholder: "main",
      emptyLabel: "Toutes les branches",
    },
    PULLS_SORT_PARAM,
    COUNT_PARAM,
  ],

  async fetch(params, token) {
    const repo = readRepoParam(params);
    const state = readChoice(params, STATE_PARAM, "all");
    const base = readOptionalString(params, "base");
    const sort = readChoice(params, PULLS_SORT_PARAM, "updated");
    const count = readCountParam(params);

    const query = new URLSearchParams({
      state,
      sort,
      direction: "desc",
      per_page: String(count),
    });
    if (base) {
      query.set("base", base);
    }

    const response = await fetchJson<PullRequestResponse[]>(`${repoPath(repo)}/pulls?${query}`, {
      headers: githubHeaders(requireToken(token)),
    });

    return {
      repo: repoLabel(repo),
      pullRequests: response.map((item) => ({
        title: item.title,
        number: item.number,
        // GitHub reports a merged PR as "closed": merged_at tells them apart
        state: item.merged_at
          ? "fusionnée"
          : item.state === "open"
            ? item.draft
              ? "brouillon"
              : "ouverte"
            : "fermée",
        author: item.user?.login ?? "inconnu",
        branches: `${item.head.ref} → ${item.base.ref}`,
        updatedAt: item.updated_at,
        url: item.html_url,
      })),
    };
  },
};

// github_releases

const PRERELEASE_PARAM: WidgetParam = {
  name: "prereleases",
  type: "string",
  label: "Préversions",
  default: "include",
  options: [
    { value: "include", label: "Inclure" },
    { value: "exclude", label: "Exclure" },
  ],
};

const releases: WidgetDefinition = {
  name: "github_releases",
  description: "Affiche les dernières versions publiées d'un dépôt",
  params: [REPO_PARAM, PRERELEASE_PARAM, COUNT_PARAM],

  async fetch(params, token) {
    const repo = readRepoParam(params);
    const prereleases = readChoice(params, PRERELEASE_PARAM, "include");
    const count = readCountParam(params);

    // Extra items so that excluding pre-releases still leaves `count` of them
    const perPage = prereleases === "exclude" ? Math.min(100, count * 3) : count;
    const response = await fetchJson<ReleaseResponse[]>(
      `${repoPath(repo)}/releases?per_page=${perPage}`,
      { headers: githubHeaders(requireToken(token)) }
    );

    const published = response
      // Drafts are only visible to maintainers and have no publication date
      .filter((item) => !item.draft)
      .filter((item) => prereleases === "include" || !item.prerelease)
      .slice(0, count);

    return {
      repo: repoLabel(repo),
      releases: published.map((item) => ({
        title: item.name || item.tag_name,
        tag: item.tag_name,
        prerelease: item.prerelease,
        author: item.author?.login ?? "inconnu",
        date: item.published_at,
        url: item.html_url,
      })),
    };
  },
};

// github_repo_stats

const repoStats: WidgetDefinition = {
  name: "github_repo_stats",
  description: "Affiche les statistiques d'un dépôt : étoiles, forks, issues ouvertes, langage",
  params: [REPO_PARAM],

  async fetch(params, token) {
    const repo = readRepoParam(params);
    const repository = await fetchJson<RepositoryResponse>(repoPath(repo), {
      headers: githubHeaders(requireToken(token)),
    });

    // Flat scalars: the generic view shows them as a key/value list
    return {
      repo: repository.full_name,
      description: repository.description ?? "",
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      watchers: repository.subscribers_count ?? null,
      openIssuesAndPullRequests: repository.open_issues_count,
      language: repository.language ?? "",
      license: repository.license?.name ?? "",
      defaultBranch: repository.default_branch,
      visibility: repository.private ? "privé" : "public",
      archived: repository.archived,
      lastPush: repository.pushed_at,
      url: repository.html_url,
    };
  },
};

export const githubService: ServiceProvider = {
  name: "github",
  requiresAuth: true,
  getOAuthConfig,
  widgets: [commits, issues, pullRequests, releases, repoStats],
};
