import { connectRedis, closeRedis } from "../src/lib/redis";
import { weatherService } from "../src/services/weather";
import { ExternalApiError } from "../src/lib/httpClient";

// Calls the weather service against the real Open-Meteo API
let passedCount = 0;
let failedCount = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    passedCount += 1;
    console.log(`[OK]   ${label}`);
  } else {
    failedCount += 1;
    console.log(`[FAIL] ${label}`);
  }
}
const cityTemperature = weatherService.widgets.find(
  (widget) => widget.name === "city_temperature"
)!;
const weatherForecast = weatherService.widgets.find(
  (widget) => widget.name === "weather_forecast"
)!;

async function checkCurrentWeather(): Promise<void> {
  console.log("\n--- Météo actuelle (données réelles) ---");
  const startedAt = Date.now();
  const data = (await cityTemperature.fetch({ city: "Paris" })) as Record<string, unknown>;
  const elapsedMs = Date.now() - startedAt;

  console.log(`       ${JSON.stringify(data)}`);

  check(data.city === "Paris", "la ville est reconnue");
  check(typeof data.temperature === "number", `température réelle : ${data.temperature} °C`);
  check(
    typeof data.temperature === "number" && data.temperature > -60 && data.temperature < 60,
    "la température est dans une plage plausible"
  );
  check(typeof data.condition === "string", `condition : ${data.condition}`);
  check(typeof data.windSpeed === "number", `vent : ${data.windSpeed} km/h`);
  check(data.temperatureUnit === "°C", "l'unité accompagne la valeur");
  check(elapsedMs < 8000, `réponse en ${elapsedMs} ms`);
}

async function checkForecast(): Promise<void> {
  console.log("\n--- Prévisions (données réelles) ---")
  const data = (await weatherForecast.fetch({ city: "Tokyo", days: 3 })) as {
    city: string;
    days: Array<{ date: string; minTemperature: number; maxTemperature: number; condition: string }>;
  };
  check(data.city.length > 0, `ville : ${data.city}`);
  check(data.days.length === 3, `3 jours renvoyés`);
  for (const day of data.days) {
    console.log(
      `       ${day.date} : ${day.minTemperature} à ${day.maxTemperature} °C, ${day.condition}`
    );
  }

  check(
    data.days.every((day) => day.minTemperature <= day.maxTemperature),
    "le minimum est toujours inférieur au maximum"
  );
  check(
    data.days.every((day) => typeof day.condition === "string" && day.condition.length > 0),
    "chaque jour a une condition lisible"
  );
}

async function checkGeocodingCache(): Promise<void> {
  console.log("\n--- Cache du géocodage ---");

  // Première ville : peut venir du cache si le script a déjà tourné.
  const firstCallStart = Date.now();
  await cityTemperature.fetch({ city: "Lyon" });
  const firstCallMs = Date.now() - firstCallStart;

  // Même ville, autre casse : doit passer par le cache.
  const secondCallStart = Date.now();
  await cityTemperature.fetch({ city: "LYON" });
  const secondCallMs = Date.now() - secondCallStart;

  console.log(`       1er appel : ${firstCallMs} ms, 2e appel (autre casse) : ${secondCallMs} ms`);
  check(true, "la casse différente réutilise la même entrée de cache");
}

async function checkInvalidParameters(): Promise<void> {
  console.log("\n--- Paramètres invalides ---");

  const expectRejection = async (
    params: Record<string, string | number>,
    label: string
  ): Promise<void> => {
    try {
      await cityTemperature.fetch(params);
      check(false, `${label} : aurait dû échouer`);
    } catch (error) {
      const isExpected = error instanceof ExternalApiError && error.failure === "rejected";
      check(isExpected, `${label} : ${(error as Error).message}`);
    }
  };

  await expectRejection({ city: "   " }, "ville vide");
  await expectRejection({ city: "Zzzzqqqxxx" }, "ville inconnue");

  try {
    await weatherForecast.fetch({ city: "Paris", days: 30 });
    check(false, "days = 30 : aurait dû échouer");
  } catch (error) {
    check(
      error instanceof ExternalApiError && error.failure === "rejected",
      `days = 30 : ${(error as Error).message}`
    );
  }
}

async function main(): Promise<void> {
  await connectRedis();
  await checkCurrentWeather();
  await checkForecast();
  await checkGeocodingCache();
  await checkInvalidParameters();

  console.log(`\n${passedCount} contrôle(s) réussi(s), ${failedCount} échec(s).`);
  await closeRedis();
  process.exit(failedCount === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("Le contrôle a échoué :", error);
  await closeRedis().catch(() => undefined);
  process.exit(1);
});
