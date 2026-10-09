"use client";

import { languageColor } from "@/lib/widgets/languageColors";
import { formatScalar } from "@/lib/widgets/display";

export interface LanguageShare {
  name: string;
  percent: number;
}

/* True when a value has the shape the bar can draw */
export function isLanguageShares(value: unknown): value is LanguageShare[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as LanguageShare).name === "string" &&
        typeof (item as LanguageShare).percent === "number"
    )
  );
}

export function LanguageBar({ languages }: { languages: LanguageShare[] }) {
  /*
   Rounding each share to one decimal leaves the total a little off 100.
   Dividing by the real total rather than by 100 keeps the bar flush with its
   own edges, whatever the drift
  */
  const totalPercent = languages.reduce((total, language) => total + language.percent, 0);

  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Langages</p>

      {/*
        The bar carries no information the legend does not repeat, so it is
        hidden from screen readers rather than described twice
      */}
      <div
        aria-hidden="true"
        className="flex h-2 w-full overflow-hidden rounded-full bg-raised"
      >
        {languages.map((language) => (
          <span
            key={language.name}
            title={`${language.name} ${formatScalar(language.percent, "%")}`}
            style={{
              width: `${(language.percent / totalPercent) * 100}%`,
              backgroundColor: languageColor(language.name),
            }}
          />
        ))}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {languages.map((language) => (
          <li key={language.name} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: languageColor(language.name) }}
            />
            <span className="text-white">{language.name}</span>
            <span className="font-mono text-muted">
              {formatScalar(language.percent, "%")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
