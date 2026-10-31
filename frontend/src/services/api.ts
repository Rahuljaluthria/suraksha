import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { ApiErrorResponse, AuthResponse } from "@/types/auth";

let inMemoryAccessToken: string | null = null;
let onSessionExpiredCallback: (() => void) | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const setAccessToken = (token: string | null): void => {
  inMemoryAccessToken = token;
};

export const getAccessToken = (): string | null => {
  return inMemoryAccessToken;
};

export const setOnSessionExpired = (callback: () => void): void => {
  onSessionExpiredCallback = callback;
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Required for HttpOnly refresh cookie exchange
  timeout: 15000,
});

// Request Interceptor: Attach in-memory access token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (inMemoryAccessToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Concurrency-safe token refresh on exact TOKEN_EXPIRED code
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const isAuthRoute =
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/register") ||
      originalRequest.url?.includes("/auth/refresh") ||
      originalRequest.url?.includes("/auth/logout");

    // Rule: Only refresh on 401 with the exact TOKEN_EXPIRED error code.
    // Never refresh on 403 or other 401 failures (e.g. INVALID_CREDENTIALS, MISSING_TOKEN).
    const isTokenExpired =
      error.response?.status === 401 && error.response?.data?.code === "TOKEN_EXPIRED";

    if (isTokenExpired && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;

      // Adjustment 2: Concurrency control using a single shared refresh promise
      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            // Raw axios call with withCredentials to exchange the HttpOnly cookie
            const response = await axios.post<AuthResponse>(
              `${api.defaults.baseURL}/auth/refresh`,
              {},
              { withCredentials: true }
            );

            const newAccessToken = response.data?.data?.accessToken;
            if (newAccessToken) {
              setAccessToken(newAccessToken);
              return newAccessToken;
            }
            return null;
          } catch {
            // Session expired or compromised: purge in-memory token and inform Redux/App
            setAccessToken(null);
            if (onSessionExpiredCallback) {
              onSessionExpiredCallback();
            }
            return null;
          } finally {
            refreshPromise = null;
          }
        })();
      }

      const newToken = await refreshPromise;

      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }

      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);
