import { ServiceProvider, WidgetDefinition, OAuthConfig } from "./types";
import { fetchJson, ExternalApiError } from "../lib/httpClient";

// Google service: Calendar and Gmail behind a single OAuth link.
const CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_LABELS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/labels";

/*
 The permissions asked of the user.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

function getOAuthConfig(): OAuthConfig {
  return {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:8080/oauth/google/callback",
    scope: SCOPES,
    extraAuthorizationParams: {
      access_type: "offline",
      prompt: "consent",
    },
  };
}

// Shapes returned by the Google APIs

interface CalendarEventsResponse {
  items?: Array<{
    id: string;
    summary?: string;
    location?: string;
    htmlLink?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }>;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
}

interface GmailMessageResponse {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

interface GmailLabelsResponse {
  labels?: Array<{ id: string; name: string; type: string }>;
}

// Parameter validation

const MAX_ITEMS = 20;
const DEFAULT_ITEMS = 5;

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

function readLabelParam(params: Record<string, string | number>): string {
  const label = String(params.label ?? "").trim();

  if (label.length === 0) {
    throw new ExternalApiError("rejected", "Le paramètre « label » est vide");
  }
  return label;
}

/* The value of a header, whatever case Gmail used for its name */
function findHeader(message: GmailMessageResponse, headerName: string): string | null {
  const header = message.payload?.headers?.find(
    (candidate) => candidate.name.toLowerCase() === headerName.toLowerCase()
  );
  return header?.value ?? null;
}

/*
 Turns a label name into the identifier Gmail expects
 */
async function resolveLabelId(labelName: string, accessToken: string): Promise<string> {
  const builtInLabels = ["INBOX", "UNREAD", "STARRED", "IMPORTANT", "SENT", "DRAFT", "SPAM", "TRASH"];
  const upperCaseName = labelName.toUpperCase();

  if (builtInLabels.includes(upperCaseName)) {
    return upperCaseName;
  }

  const response = await fetchJson<GmailLabelsResponse>(GMAIL_LABELS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const label = response.labels?.find(
    (candidate) => candidate.name.toLowerCase() === labelName.toLowerCase()
  );

  if (!label) {
    throw new ExternalApiError("rejected", `Libellé Gmail introuvable : « ${labelName} »`);
  }
  return label.id;
}

// Widgets

const calendarNext: WidgetDefinition = {
  name: "google_calendar_next",
  description: "Affiche les N prochains événements de l'agenda",
  params: [{ name: "count", type: "integer" }],
  async fetch(params, token) {
    const count = readCountParam(params);
    if (!token) {
      throw new ExternalApiError("rejected", "Compte Google non lié");
    }

    /*
     timeMin=now with singleEvents and orderBy=startTime is the only way to
     get events in chronological order: without singleEvents, a weekly
     meeting comes back as one recurring entry rather than its next
     occurrence, and orderBy is rejected
     */
    const url =
      `${CALENDAR_EVENTS_URL}?timeMin=${encodeURIComponent(new Date().toISOString())}` +
      `&maxResults=${count}&singleEvents=true&orderBy=startTime`;
    const response = await fetchJson<CalendarEventsResponse>(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const events = response.items ?? [];

    return {
      eventCount: events.length,
      events: events.map((event) => ({
        // An event without a title is legal in Calendar, and shows as
        // "(no title)" in Google's own interface
        title: event.summary ?? "(sans titre)",
        // An all-day event carries `date`, a timed one `dateTime`. Taking
        // whichever is present keeps both readable
        start: event.start?.dateTime ?? event.start?.date ?? null,
        end: event.end?.dateTime ?? event.end?.date ?? null,
        location: event.location ?? null,
        url: event.htmlLink ?? null,
      })),
    };
  },
};

const gmailUnread: WidgetDefinition = {
  name: "google_gmail_unread",
  description: "Affiche les N derniers messages non lus d'un libellé",
  params: [
    { name: "label", type: "string" },
    { name: "count", type: "integer" },
  ],

  async fetch(params, token) {
    const label = readLabelParam(params);
    const count = readCountParam(params);

    if (!token) {
      throw new ExternalApiError("rejected", "Compte Google non lié");
    }

    const labelId = await resolveLabelId(label, token);

    const listUrl =
      `${GMAIL_MESSAGES_URL}?labelIds=${encodeURIComponent(labelId)}` +
      `&q=is:unread&maxResults=${count}`;

    const list = await fetchJson<GmailListResponse>(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const messageRefs = list.messages ?? [];

    /*
     Gmail's list endpoint returns identifiers only, so each message needs its
     own call for a subject and a sender
     */
    const messages = await Promise.all(
      messageRefs.map((messageRef) =>
        fetchJson<GmailMessageResponse>(
          `${GMAIL_MESSAGES_URL}/${messageRef.id}` +
            `?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      )
    );

    return {
      label,
      // The estimate counts every unread message of the label, not just the
      // ones displayed: "3 of 47 unread" is more useful than "3"
      unreadCount: list.resultSizeEstimate ?? messageRefs.length,
      messages: messages.map((message) => ({
        subject: findHeader(message, "Subject") ?? "(sans objet)",
        from: findHeader(message, "From"),
        date: message.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : findHeader(message, "Date"),
        // The snippet is the preview Gmail itself shows in a message list
        snippet: message.snippet ?? null,
      })),
    };
  },
};

export const googleService: ServiceProvider = {
  name: "google",
  requiresAuth: true,
  getOAuthConfig,
  widgets: [calendarNext, gmailUnread],
};
