import { ServiceProvider, WidgetDefinition } from "./types";

// Open-Meteo response types. res.json() returns `unknown` in strict mode:
// without these interfaces, accessing any property raises a TS18046 error.
interface GeoResponse {
  results?: Array<{ name: string; latitude: number; longitude: number }>;
}

interface CurrentWeatherResponse {
  current_weather: { temperature: number; windspeed: number };
}

interface ForecastResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
}

async function geocode(city: string) {
  const geo = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
  ).then((r) => r.json() as Promise<GeoResponse>);

  const location = geo.results?.[0];
  if (!location) {
    throw new Error(`Ville inconnue: ${city}`);
  }
  return location as { name: string; latitude: number; longitude: number };
}

const cityTemperature: WidgetDefinition = {
  name: "city_temperature",
  description: "Affiche la météo actuelle d'une ville",
  params: [{ name: "city", type: "string" }],
  async fetch(params) {
    const city = String(params.city ?? "Paris");
    const location = await geocode(city);

    const weather = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true`
    ).then((r) => r.json() as Promise<CurrentWeatherResponse>);

    return {
      city: location.name,
      temperature: weather.current_weather.temperature,
      windspeed: weather.current_weather.windspeed,
    };
  },
};

const weatherForecast: WidgetDefinition = {
  name: "weather_forecast",
  description: "Affiche les prévisions sur N jours",
  params: [
    { name: "city", type: "string" },
    { name: "days", type: "integer" },
  ],
  async fetch(params) {
    const city = String(params.city ?? "Paris");
    const days = Number(params.days ?? 3);
    const location = await geocode(city);

    const forecast = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=${days}&timezone=auto`
    ).then((r) => r.json() as Promise<ForecastResponse>);

    return {
      city: location.name,
      days: forecast.daily.time.map((date: string, i: number) => ({
        date,
        max: forecast.daily.temperature_2m_max[i],
        min: forecast.daily.temperature_2m_min[i],
        precipitation: forecast.daily.precipitation_sum[i],
      })),
    };
  },
};

export const weatherService: ServiceProvider = {
  name: "weather",
  requiresAuth: false,
  widgets: [cityTemperature, weatherForecast],
};
