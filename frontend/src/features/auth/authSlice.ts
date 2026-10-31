import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import type { User, ApiErrorResponse } from "@/types/auth";
import { authApiService } from "@/services/auth.service";
import { setAccessToken } from "@/services/api";
import type { LoginInput, RegisterInput } from "./authValidation";
import { AxiosError } from "axios";

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean; // Initial session restoration
  isSubmitting: boolean; // For form submits
  error: string | null;
  errorCode: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true, // App starts by checking for an active HttpOnly cookie session
  isSubmitting: false,
  error: null,
  errorCode: null,
};

export const loginUser = createAsyncThunk(
  "auth/login",
  async (credentials: LoginInput, { rejectWithValue }) => {
    try {
      const response = await authApiService.login(credentials);
      setAccessToken(response.data.accessToken);
      return response.data;
    } catch (err) {
      const error = err as AxiosError<ApiErrorResponse>;
      const message = error.response?.data?.message || "Authentication failed";
      const code = error.response?.data?.code || "AUTH_FAILED";
      return rejectWithValue({ message, code });
    }
  }
);

export const registerUser = createAsyncThunk(
  "auth/register",
  async (data: RegisterInput, { rejectWithValue }) => {
    try {
      const response = await authApiService.register(data);
      return response.data;
    } catch (err) {
      const error = err as AxiosError<ApiErrorResponse>;
      const message = error.response?.data?.message || "Registration failed";
      const code = error.response?.data?.code || "REGISTRATION_FAILED";
      return rejectWithValue({ message, code });
    }
  }
);

export const restoreSession = createAsyncThunk(
  "auth/restoreSession",
  async (_, { rejectWithValue }) => {
    try {
      const response = await authApiService.refresh();
      setAccessToken(response.data.accessToken);
      return response.data;
    } catch {
      setAccessToken(null);
      return rejectWithValue(null);
    }
  }
);

export const logoutUser = createAsyncThunk("auth/logout", async () => {
  try {
    await authApiService.logout();
  } finally {
    setAccessToken(null);
  }
});

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: User; accessToken: string }>
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.isAuthenticated = true;
      state.error = null;
      state.errorCode = null;
      setAccessToken(action.payload.accessToken);
    },
    clearCredentials: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      state.error = null;
      state.errorCode = null;
      setAccessToken(null);
    },
    clearAuthError: (state) => {
      state.error = null;
      state.errorCode = null;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginUser.pending, (state) => {
        state.isSubmitting = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isSubmitting = false;
        state.isAuthenticated = false;
        state.user = null;
        state.accessToken = null;
        const payload = action.payload as { message: string; code: string } | undefined;
        state.error = payload?.message || "Login failed";
        state.errorCode = payload?.code || "AUTH_FAILED";
      });

    // Register
    builder
      .addCase(registerUser.pending, (state) => {
        state.isSubmitting = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(registerUser.fulfilled, (state) => {
        state.isSubmitting = false;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isSubmitting = false;
        const payload = action.payload as { message: string; code: string } | undefined;
        state.error = payload?.message || "Registration failed";
        state.errorCode = payload?.code || "REGISTRATION_FAILED";
      });

    // Restore Session
    builder
      .addCase(restoreSession.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.accessToken = null;
      });

    // Logout
    builder.addCase(logoutUser.fulfilled, (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      state.error = null;
      state.errorCode = null;
    });
  },
});

export const { setCredentials, clearCredentials, clearAuthError } = authSlice.actions;
export default authSlice.reducer;

