"use client";

import {
  isToday,
  roundTemperature,
  shortWeekdayFor,
  weatherIconFor,
} from "@/lib/widgets/weatherIcons";

// Weather, laid out the way weather apps lay it out

interface ForecastDay {
  date: string;
  minTemperature?: number;
  maxTemperature?: number;
  precipitation?: number;
  condition?: string;
  weatherCode?: number;
  humidity?: number | null;
}

/* True when the payload looks like a forecast rather than a current reading */
export function isForecastData(data: Record<string, unknown>): boolean {
  return Array.isArray(data.days) && data.days.length > 0;
}

export function WeatherView({ data }: { data: Record<string, unknown> }) {
  return isForecastData(data) ? <ForecastView data={data} /> : <CurrentWeatherView data={data} />;
}

/*
 Current weather: the temperature large, the icon beside it, the measures
 underneath
 */
function CurrentWeatherView({ data }: { data: Record<string, unknown> }) {
  const temperature = data.temperature;
  const unit = typeof data.temperatureUnit === "string" ? data.temperatureUnit : "°C";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1">
            <span className="text-4xl font-semibold leading-none text-white">
              {typeof temperature === "number" ? temperature.toLocaleString("fr-FR") : "—"}
            </span>
            <span className="text-lg text-muted">{unit}</span>
          </p>

          {typeof data.condition === "string" && (
            <p className="mt-1 truncate text-sm text-white">{data.condition}</p>
          )}

          {/* What it feels like, which is what people dress by. Shown only
              when the provider sent it */}
          {typeof data.apparentTemperature === "number" && (
            <p className="text-xs text-muted">
              Ressenti {Math.round(data.apparentTemperature)} {unit}
            </p>
          )}
        </div>

        {/* Decorative: the condition is written right next to it, so a screen
            reader would otherwise hear the same thing twice */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={weatherIconFor(data.weatherCode as number | undefined)}
          alt=""
          aria-hidden="true"
          className="h-16 w-16 shrink-0"
        />
      </div>

      {/* The measures, as a row of columns like a weather app: the eye reads
          three figures side by side faster than three labelled lines */}
      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-3 text-sm">
        <Measure label="Humidité" value={data.humidity} unit={data.humidityUnit ?? "%"} />
        <Measure label="Vent" value={data.windSpeed} unit={data.windSpeedUnit} />
        <Measure label="Relevé à" value={formatHour(data.observedAt)} />
      </dl>
    </div>
  );
}

/* One figure of the measures row */
function Measure({ label, value, unit }: { label: string; value: unknown; unit?: unknown }) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const text = typeof value === "number" ? value.toLocaleString("fr-FR") : String(value);

  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-white">
        {text}
        {typeof unit === "string" ? `${unit === "%" ? "" : " "}${unit}` : ""}
      </dd>
    </div>
  );
}

function formatHour(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/*
 Forecast: one column per day, as every weather app does it
 */
function ForecastView({ data }: { data: Record<string, unknown> }) {
  const days = (data.days as ForecastDay[]) ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/*
        The columns scroll sideways rather than shrink: seven days in a narrow
        widget would get thirty pixels each, and nothing would be readable.
      */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {days.map((day) => (
          <div
            key={day.date}
            className={`flex min-w-[4.5rem] flex-col items-center gap-1 rounded-md px-2 py-2 ${
              isToday(day.date) ? "bg-raised" : ""
            }`}
          >
            <span className="text-xs text-muted">
              {isToday(day.date) ? "Auj." : shortWeekdayFor(day.date)}
            </span>

            {/* The wording on hover: the icon alone cannot tell drizzle from
                showers, and the column has no room for the sentence. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={weatherIconFor(day.weatherCode)}
              alt=""
              aria-hidden="true"
              title={day.condition}
              className="h-9 w-9"
            />

            <span className="font-mono text-sm text-white">
              {roundTemperature(day.maxTemperature)}
            </span>
            <span className="font-mono text-xs text-muted">
              {roundTemperature(day.minTemperature)}
            </span>

            {typeof day.humidity === "number" && (
              <span className="font-mono text-xs text-muted" title="Humidité moyenne">
                {day.humidity}%
              </span>
            )}

            {typeof day.precipitation === "number" && day.precipitation > 0 && (
              <span className="font-mono text-xs text-signal" title="Précipitations">
                {day.precipitation.toLocaleString("fr-FR")} mm
              </span>
            )}
          </div>
        ))}
      </div>

      {/* The reading order for a screen reader, which cannot make sense of a
          row of columns */}
      <ul className="sr-only">
        {days.map((day) => (
          <li key={day.date}>
            {shortWeekdayFor(day.date)} : {day.condition}, de{" "}
            {roundTemperature(day.minTemperature)} à {roundTemperature(day.maxTemperature)}
            {typeof day.humidity === "number" ? `, ${day.humidity}% d'humidité` : ""}
          </li>
        ))}
      </ul>

      {typeof data.country === "string" && <p className="text-xs text-muted">{data.country}</p>}
    </div>
  );
}
