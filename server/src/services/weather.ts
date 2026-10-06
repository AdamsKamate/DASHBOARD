import { ServiceProvider, WidgetDefinition } from "./types";
import { fetchJson, ExternalApiError } from "../lib/httpClient";
import { cacheGet, cacheSet } from "../lib/redis";

// Weather service the first concrete ServiceProvider

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/*
 How long a city's coordinates stay cached
 */
const GEOCODING_CACHE_TTL_SECONDS = 86_400;

const MAX_FORECAST_DAYS = 16; // Open-Meteo's own limit
const DEFAULT_FORECAST_DAYS = 3;

// Open-Meteo response shapes

interface GeocodingResponse {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
  }>;
}

interface CurrentWeatherResponse {
  current_weather?: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
    time: string;
  };
}

interface ForecastResponse {
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weathercode: number[];
  };
}

interface GeocodedCity {
  name: string;
  country: string | null;
  latitude: number;
  longitude: number;
}

// Weather codes

/*
 Open-Meteo answers a WMO numeric code, not a label
 */
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Ciel dégagé",
  1: "Plutôt dégagé",
  2: "Partiellement nuageux",
  3: "Couvert",
  45: "Brouillard",
  48: "Brouillard givrant",
  51: "Bruine légère",
  53: "Bruine",
  55: "Bruine dense",
  61: "Pluie faible",
  63: "Pluie",
  65: "Pluie forte",
  66: "Pluie verglaçante",
  67: "Pluie verglaçante forte",
  71: "Neige faible",
  73: "Neige",
  75: "Neige forte",
  77: "Grains de neige",
  80: "Averses faibles",
  81: "Averses",
  82: "Averses violentes",
  85: "Averses de neige",
  86: "Averses de neige fortes",
  95: "Orage",
  96: "Orage avec grêle",
  99: "Orage violent avec grêle",
};

function describeWeatherCode(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? "Conditions inconnues";
}

// Parameter validation
//
const MAX_CITY_LENGTH = 80;
function readCityParam(params: Record<string, string | number>): string {
  const city = String(params.city ?? "").trim();

  if (city.length === 0) {
    throw new ExternalApiError("rejected", "Le paramètre « city » est vide");
  }
  if (city.length > MAX_CITY_LENGTH) {
    throw new ExternalApiError(
      "rejected",
      `Le nom de ville dépasse ${MAX_CITY_LENGTH} caractères`
    );
  }
  return city;
}

function readDaysParam(params: Record<string, string | number>): number {
  const days = Number(params.days ?? DEFAULT_FORECAST_DAYS);

  if (!Number.isInteger(days) || days < 1) {
    throw new ExternalApiError("rejected", "Le paramètre « days » doit être un entier positif");
  }
  if (days > MAX_FORECAST_DAYS) {
    throw new ExternalApiError(
      "rejected",
      `Open-Meteo ne fournit que ${MAX_FORECAST_DAYS} jours de prévision`
    );
  }
  return days;
}

// Geocoding

/*
 Turns a city name into coordinates, through Redis when possible
 */
async function geocodeCity(city: string): Promise<GeocodedCity> {
  const cacheKey = `weather:geocode:${city.toLowerCase()}`;

  const cachedCity = await cacheGet<GeocodedCity>(cacheKey);
  if (cachedCity) {
    return cachedCity;
  }

  const response = await fetchJson<GeocodingResponse>(
    `${GEOCODING_URL}?name=${encodeURIComponent(city)}&count=1&language=fr`
  );

  const location = response.results?.[0];
  if (!location) {
    // "rejected" and not "provider_error": Open-Meteo answered correctly,
    // the city simply does not exist. The user must fix their parameter
    throw new ExternalApiError("rejected", `Ville introuvable : « ${city} »`);
  }

  const geocodedCity: GeocodedCity = {
    name: location.name,
    country: location.country ?? null,
    latitude: location.latitude,
    longitude: location.longitude,
  };

  await cacheSet(cacheKey, geocodedCity, GEOCODING_CACHE_TTL_SECONDS);
  return geocodedCity;
}

// Widgets
const cityTemperature: WidgetDefinition = {
  name: "city_temperature",
  description: "Affiche la météo actuelle d'une ville",
  params: [
    { name: "city", type: "string", label: "Ville", default: "Paris" },
  ],

  async fetch(params) {
    const city = readCityParam(params);
    const location = await geocodeCity(city);
    const response = await fetchJson<CurrentWeatherResponse>(
      `${FORECAST_URL}?latitude=${location.latitude}&longitude=${location.longitude}` +
        `&current_weather=true&timezone=auto`
    );
    const currentWeather = response.current_weather;
    if (!currentWeather) {
      throw new ExternalApiError("unreadable", "Open-Meteo n'a renvoyé aucune donnée actuelle");
    }

    return {
      city: location.name,
      country: location.country,
      temperature: currentWeather.temperature,
      // The unit travels with the value: the front end displays it without
      // having to know what Open-Meteo returns
      temperatureUnit: "°C",
      windSpeed: currentWeather.windspeed,
      windSpeedUnit: "km/h",
      condition: describeWeatherCode(currentWeather.weathercode),
      weatherCode: currentWeather.weathercode,
      observedAt: currentWeather.time,
    };
  },
};

const weatherForecast: WidgetDefinition = {
  name: "weather_forecast",
  description: "Consultez les prévisions climatiques détaillées sur la période de votre choix.",
  params: [
    { name: "city", type: "string", label: "Ville", default: "Paris" },
    {
      name: "days",
      type: "integer",
      label: "Nombre de jours",
      default: DEFAULT_FORECAST_DAYS,
      min: 1,
      max: MAX_FORECAST_DAYS,
    },
  ],

  async fetch(params) {
    const city = readCityParam(params);
    const days = readDaysParam(params);
    const location = await geocodeCity(city);
    const response = await fetchJson<ForecastResponse>(
      `${FORECAST_URL}?latitude=${location.latitude}&longitude=${location.longitude}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
        `&forecast_days=${days}&timezone=auto`
    );
    const daily = response.daily;
    if (!daily?.time) {
      throw new ExternalApiError("unreadable", "Open-Meteo n'a renvoyé aucune prévision");
    }
    return {
      city: location.name,
      country: location.country,
      temperatureUnit: "°C",
      days: daily.time.map((date, index) => ({
        date,
        minTemperature: daily.temperature_2m_min[index],
        maxTemperature: daily.temperature_2m_max[index],
        precipitation: daily.precipitation_sum[index],
        precipitationUnit: "mm",
        condition: describeWeatherCode(daily.weathercode[index]),
        weatherCode: daily.weathercode[index],
      })),
    };
  },
};

export const weatherService: ServiceProvider = {
  name: "weather",
  // No authentication: no OAuth, no token, no account to link.
  requiresAuth: false,
  widgets: [cityTemperature, weatherForecast],
};
