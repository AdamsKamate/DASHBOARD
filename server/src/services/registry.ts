import { ServiceProvider } from "./types";
import { weatherService } from "./weather";
import { githubService } from "./github";
import { rssService } from "./rss";
import { googleService } from "./google";

export const registry: ServiceProvider[] = [
  weatherService,
  rssService,
  githubService,
  googleService,
];
