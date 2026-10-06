"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Service } from "@/lib/types";

// The services, as a row of logos in the header

interface ServiceDisplay {
  name: string;
  icon: string;
  forceWhite?: boolean;
}

const SERVICES: Record<string, ServiceDisplay> = {
  weather: { name: "Météo", icon: "/icons/services/weather.svg" },
  rss: { name: "Flux RSS", icon: "/icons/services/rss.svg" },
  github: { name: "GitHub", icon: "/icons/services/github.svg", forceWhite: true },
  google: { name: "Google", icon: "/icons/services/google.svg" },
};

interface ServiceIconsProps {
  services: Service[];
}

export function ServiceIcons({ services }: ServiceIconsProps) {
  const router = useRouter();

  if (services.length === 0) {
    return null;
  }

  function handleClick(service: Service) {
    /*
     A service needing no authorisation has nothing to link, but the icon must
     still do something: a button that looks clickable and does nothing is
     worse than no button. It opens the Services page, where its state is
     explained.
    */
    if (service.subscribed || !service.requiresAuth) {
      router.push("/services");
      return;
    }
    // Full page navigation towards the provider: nothing comes back here
    void api.services.link(service.name);
  }

  return (
    /*
     A list rather than a row of buttons: a screen reader then announces how
     many services there are before reading them
    */
    <ul className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1">
      {services.map((service) => {
        const display = SERVICES[service.name];
        const name = display?.name ?? service.name;

        const isAvailable = service.subscribed || !service.requiresAuth;

        const state = !service.requiresAuth
          ? "disponible"
          : service.subscribed
            ? "lié à ton compte"
            : "non lié, cliquer pour lier";

        return (
          <li key={service.name}>
            <button
              type="button"
              onClick={() => handleClick(service)}
              /*
               The state is in the label, not only in the dimming: someone who
               cannot see the opacity must still hear it
              */
              aria-label={`${name} : ${state}`}
              title={`${name} - ${state}`}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition
                          hover:bg-raised
                          ${isAvailable ? "opacity-100" : "opacity-35 hover:opacity-70"}
                          cursor-pointer`}
            >
              {display ? (
                <img
                  src={display.icon}
                  alt=""
                  aria-hidden="true"
                  className={`h-5 w-5 ${display.forceWhite ? "brightness-0 invert" : ""}`}
                />
              ) : (
                // A service with no icon file still shows, as its initial
                <span aria-hidden="true" className="text-sm font-semibold text-white">
                  {service.name.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
