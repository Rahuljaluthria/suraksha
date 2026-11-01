import { createAsyncThunk, createSlice, type AsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { dashboardService } from "@/services/dashboard.service";
import { clearCredentials, loginUser, logoutUser } from "@/features/auth/authSlice";
import type {
  IncidentStats,
  NotificationsPayload,
  SecurityActivity,
  SystemHealth,
} from "@/types/dashboard";
import type { IncidentItem } from "@/types/incident";
import type { ApiErrorResponse } from "@/types/auth";

/**
 * Every dashboard widget keeps its last good data. A failed refresh marks the widget as
 * failed but does not blank what the user is already looking at.
 */
export interface Widget<T> {
  data: T | null;
  status: "idle" | "loading" | "succeeded" | "failed" | "forbidden";
  error: string | null;
  /** Epoch ms of the last successful load. */
  updatedAt: number | null;
}

const idle = <T>(): Widget<T> => ({ data: null, status: "idle", error: null, updatedAt: null });

interface DashboardState {
  stats: Widget<IncidentStats>;
  recent: Widget<IncidentItem[]>;
  health: Widget<SystemHealth>;
  notifications: Widget<NotificationsPayload>;
  security: Widget<SecurityActivity>;
}

type WidgetKey = keyof DashboardState;
type RootWithDashboard = { dashboard: DashboardState };

const initialState: DashboardState = {
  stats: idle(),
  recent: idle(),
  health: idle(),
  notifications: idle(),
  security: idle(),
};

interface Rejection {
  message: string;
  forbidden: boolean;
}

function toRejection(err: unknown, fallback: string): Rejection {
  if (axios.isAxiosError<ApiErrorResponse>(err)) {
    return {
      message: err.response?.data?.message || (err.response ? fallback : "Cannot reach the server"),
      forbidden: err.response?.status === 403,
    };
  }
  return { message: fallback, forbidden: false };
}

/**
 * One thunk per widget. `condition` drops a request while the previous one for the same widget is
 * still in flight, so overlapping polls and double-mounted effects never stack up.
 */
function widgetThunk<T>(
  key: WidgetKey,
  fetcher: () => Promise<T>,
  failureMessage: string
): AsyncThunk<T, void, { state: RootWithDashboard; rejectValue: Rejection }> {
  return createAsyncThunk<T, void, { state: RootWithDashboard; rejectValue: Rejection }>(
    `dashboard/${key}`,
    async (_, { rejectWithValue }) => {
      try {
        return await fetcher();
      } catch (err) {
        return rejectWithValue(toRejection(err, failureMessage));
      }
    },
    { condition: (_, { getState }) => getState().dashboard[key].status !== "loading" }
  );
}

export const fetchStats = widgetThunk("stats", dashboardService.getStats, "Failed to load incident statistics");
export const fetchRecentIncidents = widgetThunk(
  "recent",
  () => dashboardService.getRecentIncidents(8),
  "Failed to load recent incidents"
);
export const fetchSystemHealth = widgetThunk("health", dashboardService.getSystemHealth, "Failed to check system health");
export const fetchNotifications = widgetThunk(
  "notifications",
  () => dashboardService.getNotifications(20),
  "Failed to load notifications"
);
export const fetchSecurityActivity = widgetThunk(
  "security",
  () => dashboardService.getSecurityActivity(24),
  "Failed to load security activity"
);

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    resetDashboard: () => initialState,
  },
  extraReducers: (builder) => {
    const wire = <T>(key: WidgetKey, thunk: ReturnType<typeof widgetThunk<T>>) => {
      builder
        .addCase(thunk.pending, (state) => {
          (state[key] as unknown as Widget<T>).status = "loading";
        })
        .addCase(thunk.fulfilled, (state, action) => {
          Object.assign(state[key] as unknown as Widget<T>, {
            data: action.payload,
            status: "succeeded",
            error: null,
            updatedAt: Date.now(),
          });
        })
        .addCase(thunk.rejected, (state, action) => {
          const widget = state[key] as unknown as Widget<T>;
          widget.status = action.payload?.forbidden ? "forbidden" : "failed";
          widget.error = action.payload?.message ?? action.error.message ?? "Request failed";
        });
    };

    wire("stats", fetchStats);
    wire("recent", fetchRecentIncidents);
    wire("health", fetchSystemHealth);
    wire("notifications", fetchNotifications);
    wire("security", fetchSecurityActivity);

    // Never show one user's data to the next person who signs in on the same tab.
    builder
      .addCase(loginUser.fulfilled, () => initialState)
      .addCase(logoutUser.fulfilled, () => initialState)
      .addCase(clearCredentials, () => initialState);
  },
});

export const { resetDashboard } = dashboardSlice.actions;
export default dashboardSlice.reducer;
