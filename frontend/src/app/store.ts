import { configureStore } from "@reduxjs/toolkit";
import authReducer, { clearCredentials } from "@/features/auth/authSlice";
import incidentReducer from "@/features/incidents/incidentSlice";
import dashboardReducer from "@/features/dashboard/dashboardSlice";
import { setOnSessionExpired } from "@/services/api";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    incidents: incidentReducer,
    dashboard: dashboardReducer,
  },
  devTools: import.meta.env.DEV,
});

// Attach session-expiration listener to Axios interceptor
setOnSessionExpired(() => {
  store.dispatch(clearCredentials());
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
