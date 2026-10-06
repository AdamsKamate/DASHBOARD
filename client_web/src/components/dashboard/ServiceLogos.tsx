// Service logos

const ICON_BASE = "/icons/services";

/* File per service, and the name shown in labels and tooltips */
const SERVICE_LOGOS: Record<string, { file: string; name: string }> = {
  weather: { file: "weather.svg", name: "Météo" },
  github: { file: "github.svg", name: "GitHub" },
  google: { file: "google.svg", name: "Google" },
  rss: { file: "rss.svg", name: "Flux RSS" },
};

/* Human names, used in the labels and tooltips */
export const SERVICE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(SERVICE_LOGOS).map(([serviceName, { name }]) => [serviceName, name])
);

interface ServiceLogoProps {
  serviceName: string;
  className?: string;
}

/*
 The logo of a service
 */
export function ServiceLogo({ serviceName, className }: ServiceLogoProps) {
  const logo = SERVICE_LOGOS[serviceName];

  if (!logo) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" opacity="0.25" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill="currentColor"
        >
          {serviceName.charAt(0).toUpperCase()}
        </text>
      </svg>
    );
  }

  return (
    // Decorative: the button around it already announces the service and its
    // state, so an alt text here would be read twice
    <img src={`${ICON_BASE}/${logo.file}`} alt="" aria-hidden="true" className={className} />
  );
}
