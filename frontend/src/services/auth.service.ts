import { api } from "./api";
import type {
  AuthResponse,
  RegisterResponse,
  MeResponse,
} from "@/types/auth";
import type { LoginInput, RegisterInput } from "@/features/auth/authValidation";

export const authApiService = {
  async register(data: RegisterInput): Promise<RegisterResponse> {
    const response = await api.post<RegisterResponse>("/auth/register", data);
    return response.data;
  },

  async login(credentials: LoginInput): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>("/auth/login", credentials);
    return response.data;
  },

  async refresh(): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>("/auth/refresh", {});
    return response.data;
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>("/auth/logout", {});
    return response.data;
  },

  async getMe(): Promise<MeResponse> {
    const response = await api.get<MeResponse>("/auth/me");
    return response.data;
  },
};

