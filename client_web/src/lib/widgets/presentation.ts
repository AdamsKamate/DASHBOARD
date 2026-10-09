// Giving a widget a human face

export interface WidgetPresentation {
  /* Title shown in the block header */
  title: string;
  /* An emoji standing in for an icon set we do not have */
  icon: string;
  /*
   The field to show large, and its unit field when there is one
   */
  headline?: { valueKey: string; unitKey?: string; captionKey?: string };
}

/*
 Known widgets, by type identifier
 */
const PRESENTATIONS: Record<string, WidgetPresentation> = {
  city_temperature: {
    title: "Météo",
    icon: "🌤",
    headline: { valueKey: "temperature", unitKey: "temperatureUnit", captionKey: "condition" },
  },
  weather_forecast: {
    title: "Prévisions",
    icon: "📅",
  },
  github_commits: {
    title: "Derniers commits",
    icon: "💻",
  },
  github_issues: {
    title: "Issues",
    icon: "⚠️",
  },
  github_pull_requests: {
    title: "Pull requests",
    icon: "🔀",
  },
  github_releases: {
    title: "Versions publiées",
    icon: "🚀",
  },
  github_repo_stats: {
    title: "Statistiques du dépôt",
    icon: "📊",
  },
  google_calendar_next: {
    title: "Google Agenda",
    icon: "📆",
    headline: { valueKey: "eventCount", captionKey: "nextEvent" },
  },
  google_gmail_unread: {
    title: "Gmail",
    icon: "✉",
    headline: { valueKey: "unreadCount", captionKey: "label" },
  },
  article_list: {
    title: "Articles",
    icon: "📰",
  },
  feed_summary: {
    title: "Flux",
    icon: "📡",
  },
};

/*
 The presentation of a widget type
 */
export function presentationFor(widgetTypeId: string): WidgetPresentation {
  return PRESENTATIONS[widgetTypeId] ?? { title: widgetTypeId, icon: "▦" };
}

/*
 A subtitle from the widget's own configuration
 */
export function subtitleFrom(params: Record<string, string | number>): string | null {
  for (const value of Object.values(params)) {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return null;
}

// Naming the data fields
const FIELD_LABELS: Record<string, string> = {
  // Weather
  city: "Ville",
  country: "Pays",
  temperature: "Température",
  windSpeed: "Vent",
  condition: "Conditions",
  observedAt: "Relevé à",
  minTemperature: "Minimum",
  maxTemperature: "Maximum",
  precipitation: "Précipitations",
  days: "Jours",
  date: "Date",

  // Google
  eventCount: "Événements",
  events: "Prochains événements",
  unreadCount: "Non lus",
  messages: "Messages",
  label: "Libellé",
  subject: "Objet",
  from: "De",
  snippet: "Aperçu",
  start: "Début",
  end: "Fin",
  location: "Lieu",
  title: "Titre",

  // GitHub
  repo: "Dépôt",
  description: "Description",
  commitCount: "Commits",
  contributorCount: "Contributeurs",
  languages: "Langages",
  stars: "Étoiles",
  forks: "Forks",
  watchers: "Observateurs",
  openIssuesAndPullRequests: "Issues et PR ouvertes",
  language: "Langage",
  license: "Licence",
  defaultBranch: "Branche par défaut",
  visibility: "Visibilité",
  archived: "Archivé",
  lastPush: "Dernier push",
  pullRequests: "Pull requests",
  releases: "Versions",
  tag: "Étiquette",
  publishedAt: "Publiée le",
  branch: "Branche",
  sha: "Empreinte",
  commits: "Commits",
  message: "Message",
  author: "Auteur",
  issues: "Issues",
  state: "État",
};

/*
 Fields the user has no use for
 */
const HIDDEN_FIELDS = new Set(["weatherCode", "url", "id", "threadId"]);

export function isHiddenField(key: string): boolean {
  return HIDDEN_FIELDS.has(key);
}

/* The French label of a field, or null when there is none */
export function fieldLabelFor(key: string): string | null {
  return FIELD_LABELS[key] ?? null;
}
