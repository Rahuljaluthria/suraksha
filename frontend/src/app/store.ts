import { configureStore } from "@reduxjs/toolkit";
import authReducer, { clearCredentials } from "@/features/auth/authSlice";
import { setOnSessionExpired } from "@/services/api";

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
  devTools: import.meta.env.DEV,
});

// Attach session-expiration listener to Axios interceptor
setOnSessionExpired(() => {
  store.dispatch(clearCredentials());
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
