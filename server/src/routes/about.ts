import { Router, Request, Response } from "express";


/*
 Extracts the client's IP address.
 Behind Docker, Express often returns an IPv6-mapped IPv4 address
 (::ffff:172.18.0.1), so we normalize it to a plain IPv4 address.
 */
function getClientHost(req: Request): string {
  const raw =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    "";
  return raw.replace(/^::ffff:/, "");
}

const router = Router();

router.get("/about.json", (req: Request, res: Response) => {
  res.json({
    client: {
      host: getClientHost(req),
    },
    server: {
      current_time: Math.floor(Date.now() / 1000),
      services: [
        {
          name: "weather",
          widgets: [
            {
              name: "city_temperature",
              description: "Affiche la météo actuelle d'une ville",
              params: [{ name: "city", type: "string" }],
            },
            {
              name: "weather_forecast",
              description: "Affiche les prévisions sur N jours",
              params: [
                { name: "city", type: "string" },
                { name: "days", type: "integer" },
              ],
            },
          ],
        },
        {
          name: "rss",
          widgets: [
            {
              name: "article_list",
              description: "Affiche les derniers articles d'un flux RSS",
              params: [
                { name: "link", type: "string" },
                { name: "number", type: "integer" },
              ],
            },
            {
              name: "feed_summary",
              description: "Affiche le résumé du dernier article d'un flux",
              params: [{ name: "link", type: "string" }],
            },
          ],
        },
        {
          name: "github",
          widgets: [
            {
              name: "github_commits",
              description: "Liste les derniers commits d'un dépôt",
              params: [
                { name: "repo", type: "string" },
                { name: "count", type: "integer" },
              ],
            },
            {
              name: "github_issues",
              description: "Liste les issues d'un dépôt selon leur état",
              params: [
                { name: "repo", type: "string" },
                { name: "state", type: "string" },
              ],
            },
          ],
        },
        {
          name: "google",
          widgets: [
            {
              name: "google_calendar_next",
              description: "Affiche les N prochains événements du calendrier",
              params: [{ name: "count", type: "integer" }],
            },
            {
              name: "google_gmail_unread",
              description: "Affiche les N derniers messages non lus d'un label",
              params: [
                { name: "label", type: "string" },
                { name: "count", type: "integer" },
              ],
            },
          ],
        },
      ],
    },
  });
});

export default router;
