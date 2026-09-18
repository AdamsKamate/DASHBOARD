import { ServiceProvider } from "./types";
import { weatherService } from "./weather";
// import { rssService } from "./rss";
// import { githubService } from "./github";
// import { googleService } from "./google";

export const registry: ServiceProvider[] = [
  weatherService,
  // rssService,
  // githubService,
  // googleService,
];