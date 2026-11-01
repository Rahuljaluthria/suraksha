import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/app/hooks";
import {
  fetchNotifications,
  fetchRecentIncidents,
  fetchSecurityActivity,
  fetchStats,
  fetchSystemHealth,
} from "./dashboardSlice";

/** The API allows 200 requests per 15 minutes per client, so the dashboard polls gently. */
export const DASHBOARD_POLL_MS = 60_000;
const STALE_AFTER_MS = 30_000;

interface Options {
  /** The user may read incidents (any scope). */
  incidents: boolean;
  /** The user holds audit:read and may load security activity. */
  security: boolean;
}

/**
 * Loads every widget once, then refreshes on a fixed interval. Polling pauses while the tab is
 * hidden and catches up when it becomes visible again. Returns a manual refresh function.
 */
export function useDashboardData({ incidents, security }: Options): () => void {
  const dispatch = useAppDispatch();
  const lastRun = useRef(0);

  const refresh = useCallback(() => {
    lastRun.current = Date.now();
    dispatch(fetchSystemHealth());
    dispatch(fetchNotifications());
    if (incidents) {
      dispatch(fetchStats());
      dispatch(fetchRecentIncidents());
    }
    if (security) dispatch(fetchSecurityActivity());
  }, [dispatch, incidents, security]);

  useEffect(() => {
    refresh();

    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun.current > STALE_AFTER_MS) refresh();
    };

    const timer = window.setInterval(tick, DASHBOARD_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return refresh;
}
