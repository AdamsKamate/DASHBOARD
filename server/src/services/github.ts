import { ServiceProvider, WidgetDefinition, OAuthConfig } from "./types";

// Minimal GitHub provider: just enough to exercise the OAuth link flow end
// to end. Widgets arrive later — the array stays empty for now.

function getOAuthConfig(): OAuthConfig {
  return {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GITHUB_REDIRECT_URI ?? "http://localhost:8080/oauth/github/callback",
    scope: "repo",
  };
}

const widgets: WidgetDefinition[] = [];

export const githubService: ServiceProvider = {
  name: "github",
  requiresAuth: true,
  getOAuthConfig,
  widgets,
};
