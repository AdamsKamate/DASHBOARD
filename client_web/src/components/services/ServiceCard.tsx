"use client";

import { Button } from "@/components/ui";
import type { Service } from "@/lib/types";

// One service, with its linking state

/* Human label and one-line description per service */
const SERVICE_LABELS: Record<string, { title: string; description: string }> = {
  weather: {
    title: "Météo",
    description: "Températures et prévisions pour n'importe quelle ville.",
  },
  rss: {
    title: "Flux RSS",
    description: "Les derniers articles de n'importe quel flux.",
  },
  github: {
    title: "GitHub",
    description: "Commits et issues de tes dépôts.",
  },
  google: {
    title: "Google",
    description: "Agenda et messages non lus.",
  },
};

function describeService(serviceName: string) {
  return (
    SERVICE_LABELS[serviceName] ?? {
      title: serviceName,
      description: "Service disponible sur ce dashboard.",
    }
  );
}

interface ServiceCardProps {
  service: Service;
  /* True while a link or unlink request is in flight for this service */
  isBusy: boolean;
  onLink: (serviceName: string) => void;
  onUnlink: (serviceName: string) => void;
}

export function ServiceCard({ service, isBusy, onLink, onUnlink }: ServiceCardProps) {
  const { title, description } = describeService(service.name);

  return (
    <article className="rounded-md border border-line bg-surface overflow-hidden">
      <header className="flex items-start justify-between gap-4 bg-raised px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="text-xs uppercase tracking-wide text-muted">{service.name}</p>
        </div>
        <StatusBadge service={service} />
      </header>

      <div className="flex items-end justify-between gap-4 p-4">
        <p className="text-sm text-slate-400">{description}</p>
        <ServiceAction
          service={service}
          isBusy={isBusy}
          onLink={onLink}
          onUnlink={onUnlink}
        />
      </div>
    </article>
  );
}

/*
 The state, in words and in colour
 */
function StatusBadge({ service }: { service: Service }) {
  if (!service.requiresAuth) {
    return (
      <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-slate-400">
        Aucune autorisation requise
      </span>
    );
  }
  if (service.subscribed) {
    return (
      <span className="shrink-0 rounded-full border border-pulse/40 bg-pulse/10 px-2 py-0.5 text-xs text-pulse">
        Compte lié
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-xs text-amber">
      Non lié
    </span>
  );
}

function ServiceAction({ service, isBusy, onLink, onUnlink }: ServiceCardProps) {
  // A service without authentication has no action: showing a disabled
  // button would suggest something is missing
  if (!service.requiresAuth) {
    return <span className="shrink-0 text-xs text-muted">Prêt à l&apos;emploi</span>;
  }
  if (service.subscribed) {
    return (
      <Button
        variant="danger"
        disabled={isBusy}
        onClick={() => onUnlink(service.name)}
        aria-label={`Délier le compte ${service.name}`}
      >
        {isBusy ? "..." : "Délier"}
      </Button>
    );
  }

  return (
    <Button
      disabled={isBusy}
      onClick={() => onLink(service.name)}
      aria-label={`Lier mon compte ${service.name}`}
    >
      {isBusy ? "Redirection..." : "Lier mon compte"}
    </Button>
  );
}
