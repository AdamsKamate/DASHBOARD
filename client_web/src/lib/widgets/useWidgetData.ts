"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { WidgetData, WidgetParams } from "@/lib/types";
import { clockTickFor, pollIntervalFor, pollJitterFor } from "./freshness";

// Loading a widget's data, and keeping it current

export interface WidgetDataState {
  /* The last answer from the server, or null before the first one */
  data: WidgetData | null;
  /* True only before the first answer: the block has nothing to show yet */
  isInitialLoading: boolean;
  /* True during a later refresh: the block keeps showing the old data */
  isRefreshing: boolean;
  /* Redraw counter, so the displayed age stays current */
  clockTick: number;
  /* Asks the server again, now */
  refresh: () => void;
}

export function useWidgetData(
  widgetId: string,
  refreshRateSeconds: number,
  params: WidgetParams
): WidgetDataState {
  const [data, setData] = useState<WidgetData | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  /*
   Guards against a state update on an unmounted block
   */
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(
    async (isFirstLoad: boolean) => {
      if (isFirstLoad) {
        setIsInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const response = await api.widgets.data(widgetId);
        if (isMountedRef.current) {
          setData(response);
        }
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        // A 404 means the route is not on the server yet. Anything else is a
        // real failure, and the block says so rather than staying blank
        const notImplementedYet = error instanceof ApiError && error.status === 404;

        /*
         A failed refresh keeps the previous data on screen
         */
        setData((previous) =>
          previous && !notImplementedYet
            ? previous
            : {
                data: null,
                fetchedAt: null,
                status: "error",
                error: notImplementedYet
                  ? "Données disponibles en Phase 3."
                  : "Les données n'ont pas pu être récupérées.",
              }
        );
      } finally {
        if (isMountedRef.current) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [widgetId]
  );

  const refresh = useCallback(() => {
    void loadData(false);
  }, [loadData]);

  /*
   First load, then polling
   */
  useEffect(() => {
    void loadData(true);

    const intervalMs = pollIntervalFor(refreshRateSeconds);
    let intervalId: ReturnType<typeof setInterval>;

    // The jitter staggers the widgets: twelve blocks mounted by the same page
    // load would otherwise poll in the same millisecond, forever
    const jitterId = setTimeout(() => {
      void loadData(false);
      intervalId = setInterval(() => void loadData(false), intervalMs);
    }, pollJitterFor(intervalMs));

    return () => {
      clearTimeout(jitterId);
      clearInterval(intervalId);
    };
  }, [loadData, refreshRateSeconds, params]);

  /*
   The clock that keeps the displayed age honest
   */
  useEffect(() => {
    const tickMs = clockTickFor(data?.fetchedAt ?? null);
    const tickId = setInterval(() => setClockTick((previous) => previous + 1), tickMs);
    return () => clearInterval(tickId);
  }, [data?.fetchedAt]);

  /*
   Asks again as soon as the tab comes back to the foreground
   */
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadData(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadData]);

  return { data, isInitialLoading, isRefreshing, clockTick, refresh };
}
