// Telling widget failures apart, so the block can say what to do

export type WidgetErrorKind =
  /* The authorisation is gone: the user must link the account again */
  | "authorization"
  /* A parameter is wrong: the user must reconfigure the widget */
  | "configuration"
  /* The provider is down or rate-limiting: nothing to do but wait */
  | "provider"
  /* Anything else */
  | "unknown";

export interface WidgetErrorPresentation {
  kind: WidgetErrorKind;
  /* What the user should understand, beyond the server's own sentence */
  hint: string | null;
  /* Where the fix is, when there is one */
  action: { label: string; href: string } | null;
  /* True when retrying now could plausibly work */
  canRetry: boolean;
}

/* Phrases the server uses for each kind, lowercased for matching */
const AUTHORIZATION_PHRASES = ["autorisation a expiré", "relie ton compte", "n'est pas lié", "non lié"];
const CONFIGURATION_PHRASES = ["introuvable", "est vide", "doit être", "maximum", "dépasse"];
const PROVIDER_PHRASES = ["momentanément", "indisponible", "saturé", "n'a pas répondu", "injoignable"];

function matches(message: string, phrases: string[]): boolean {
  return phrases.some((phrase) => message.includes(phrase));
}

export function classifyWidgetError(rawMessage: string | undefined): WidgetErrorPresentation {
  const message = (rawMessage ?? "").toLowerCase();

  if (matches(message, AUTHORIZATION_PHRASES)) {
    return {
      kind: "authorization",
      hint: "Ce widget a besoin d'un compte lié pour récupérer ses données.",
      // The only error the user can fix in one click, and the only one worth
      // a button
      action: { label: "Gérer mes services", href: "/services" },
      // Retrying changes nothing until the account is linked again
      canRetry: false,
    };
  }
  if (matches(message, CONFIGURATION_PHRASES)) {
    return {
      kind: "configuration",
      hint: "Corrige la configuration du widget pour continuer.",
      action: null,
      // The parameter will still be wrong on the next attempt
      canRetry: false,
    };
  }
  if (matches(message, PROVIDER_PHRASES)) {
    return {
      kind: "provider",
      hint: "Le prochain rafraîchissement réessaiera tout seul.",
      action: null,
      canRetry: true,
    };
  }
  return { kind: "unknown", hint: null, action: null, canRetry: true };
}

/* Colour classes per kind. Amber for what will pass, red for what will not */
export function errorStyleFor(kind: WidgetErrorKind): {
  text: string;
  border: string;
  background: string;
  icon: string;
} {
  switch (kind) {
    case "authorization":
      return {
        text: "text-amber",
        border: "border-amber/40",
        background: "bg-amber/10",
        icon: "🔑",
      };
    case "configuration":
      return {
        text: "text-amber",
        border: "border-amber/40",
        background: "bg-amber/10",
        icon: "⚙",
      };
    case "provider":
      // Amber rather than red: the service is down, not the widget, and it
      // will come back on its own. Red would suggest something is broken for
      // good
      return {
        text: "text-amber",
        border: "border-amber/40",
        background: "bg-amber/10",
        icon: "⏳",
      };
    default:
      return {
        text: "text-flare",
        border: "border-flare/40",
        background: "bg-flare/10",
        icon: "⚠",
      };
  }
}
