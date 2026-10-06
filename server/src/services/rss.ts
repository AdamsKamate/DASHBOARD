import { ServiceProvider, WidgetDefinition } from "./types";
import { fetchText, ExternalApiError } from "../lib/httpClient";

// RSS service: any feed, no account to lin

/* Feeds offered in the form, so nobody has to go hunting for a URL */
const SUGGESTED_FEEDS = [
  { value: "https://www.lemonde.fr/rss/une.xml", label: "Le Monde  Une" },
  { value: "https://www.lemonde.fr/politique/rss_full.xml", label: "Le Monde - Politique" },
  { value: "https://www.nextinpact.com/rss/news.xml", label: "Next - Tech" },
  { value: "https://linuxfr.org/news.atom", label: "LinuxFr - Libre" },
  { value: "https://hnrss.org/frontpage", label: "Hacker News - Une" },
  { value: "https://www.lefigaro.fr/rss/figaro_politique.xml", label: "Le Figaro - Politique" },
];

const MAX_ITEMS = 20;
const DEFAULT_ITEMS = 5;

/* Shared by both widgets, so a feed is described the same way twice */
const FEED_PARAM = {
  name: "link",
  type: "string" as const,
  label: "Adresse du flux",
  default: SUGGESTED_FEEDS[0].value,
  options: SUGGESTED_FEEDS,
  help: "Choisis un flux proposé ou colle l'adresse d'un autre.",
};

interface FeedItem {
  title: string;
  link: string | null;
  publishedAt: string | null;
  author: string | null;
  summary: string | null;
}

// Parsing

/*
 Text of the first matching tag, CDATA unwrapped and entities decoded
 */
function readTag(xml: string, ...tagNames: string[]): string | null {
  for (const tagName of tagNames) {
    const match = xml.match(
      new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i")
    );
    if (match) {
      return decodeEntities(stripCdata(match[1]).trim());
    }
  }
  return null;
}

/* An attribute of the first matching tag: Atom puts its link in href */
function readAttribute(xml: string, tagName: string, attribute: string): string | null {
  const match = xml.match(new RegExp(`<${tagName}[^>]*\\s${attribute}="([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]) : null;
}

function stripCdata(text: string): string {
  return text.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ocirc: "ô",
  ugrave: "ù",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  rsquo: "'",
};

function decodeEntities(text: string): string {
  return text
    // Numeric entities first: &#39; and &#x27; are the same apostrophe.
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

/* Tags removed from a summary: a description often carries full HTML */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/* A date in ISO form, whichever format the feed used */
function normaliseDate(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  // RSS uses RFC 822 ("Mon, 06 Oct 2026 21:30:00 +0200"), Atom uses ISO.
  // Date parses both; an unparseable one is dropped rather than shown raw.
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/* Cuts a summary to a length a widget can show */
function truncate(text: string, maxLength = 180): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/*
 The author of an item
 */
function readAuthor(block: string): string | null {
  const authorBlock = block.match(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i);
  if (authorBlock) {
    const nested = readTag(authorBlock[1], "name");
    if (nested) {
      return nested;
    }
    const plain = stripHtml(decodeEntities(stripCdata(authorBlock[1]).trim()));
    if (plain !== "") {
      return plain;
    }
  }

  return readTag(block, "dc:creator", "creator");
}

function parseFeed(xml: string): { title: string | null; items: FeedItem[] } {
  // <item> is RSS, <entry> is Atom
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? [];
  const items: FeedItem[] = blocks.map((block) => {
    const summary = readTag(block, "description", "summary", "content");

    return {
      title: readTag(block, "title") ?? "(sans titre)",
      // RSS puts the URL inside <link>, Atom in its href attribute
      link: readTag(block, "link") ?? readAttribute(block, "link", "href"),
      publishedAt: normaliseDate(readTag(block, "pubDate", "published", "updated", "dc:date")),
      author: readAuthor(block),
      summary: summary ? truncate(stripHtml(summary)) : null,
    };
  });

  /*
   The feed's own title is read from the document with the items removed:
   searching the whole string would otherwise return the first article's
   title, since <title> appears inside every item too.
  */
  const header = xml.replace(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi, "");

  return { title: readTag(header, "title"), items };
}

// Parameter validation

function readFeedUrl(params: Record<string, string | number>): string {
  const url = String(params.link ?? "").trim();
  if (url === "") {
    throw new ExternalApiError("rejected", "Le paramètre « link » est vide");
  }

  /*
   Only http(s)
  */
  if (!/^https?:\/\//i.test(url)) {
    throw new ExternalApiError("rejected", "L'adresse doit commencer par http:// ou https://");
  }

  return url;
}

function readCount(params: Record<string, string | number>): number {
  const count = Number(params.number ?? DEFAULT_ITEMS);

  if (!Number.isInteger(count) || count < 1) {
    throw new ExternalApiError("rejected", "Le nombre d'articles doit être un entier positif");
  }
  if (count > MAX_ITEMS) {
    throw new ExternalApiError("rejected", `Maximum ${MAX_ITEMS} articles par widget`);
  }
  return count;
}

async function loadFeed(url: string) {
  const xml = await fetchText(url, {
    headers: {
      // Some feeds answer HTML to a browser-looking client and XML to a
      // reader; asking for XML explicitly avoids that
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });

  const feed = parseFeed(xml);

  if (feed.items.length === 0) {
    throw new ExternalApiError(
      "unreadable",
      "Aucun article trouvé : l'adresse ne pointe peut-être pas vers un flux RSS"
    );
  }

  return feed;
}

// Widgets

const articleList: WidgetDefinition = {
  name: "article_list",
  description: "Les derniers articles d'un flux d'actualité",
  params: [
    FEED_PARAM,
    {
      name: "number",
      type: "integer",
      label: "Nombre d'articles à afficher",
      default: DEFAULT_ITEMS,
      min: 1,
      max: MAX_ITEMS,
    },
  ],

  async fetch(params) {
    const url = readFeedUrl(params);
    const count = readCount(params);
    const feed = await loadFeed(url);

    return {
      feedTitle: feed.title,
      articleCount: feed.items.length,
      articles: feed.items.slice(0, count).map((item) => ({
        title: item.title,
        author: item.author,
        date: item.publishedAt,
        summary: item.summary,
        url: item.link,
      })),
    };
  },
};

const feedSummary: WidgetDefinition = {
  name: "feed_summary",
  description: "Le dernier article d'un flux, avec son résumé",
  params: [FEED_PARAM],

  async fetch(params) {
    const url = readFeedUrl(params);
    const feed = await loadFeed(url);
    const latest = feed.items[0];

    return {
      feedTitle: feed.title,
      title: latest.title,
      author: latest.author,
      date: latest.publishedAt,
      summary: latest.summary,
      url: latest.link,
      // How many more are waiting behind this one
      articleCount: feed.items.length,
    };
  },
};

export const rssService: ServiceProvider = {
  name: "rss",
  // No account, no token: a feed is public by definition
  requiresAuth: false,
  widgets: [articleList, feedSummary],
};
