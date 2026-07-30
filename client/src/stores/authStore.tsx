import React, { createContext, useContext, useState, useEffect } from "react";
import { User, UserRole } from "../types";
import { authApi, LoginRequest } from "../api/endpoints/auth";
import { ApiError } from "../api/client";

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  deviceLimitError: { message: string } | null;
  requires2FA: boolean;
  login: (emailOrReq: string | LoginRequest, passwordArg?: string) => Promise<User>;
  register: (data: { name: string; email: string; phone: string; password?: string }) => Promise<User>;
  verify2FA: (code: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (updated: Partial<User>) => void;
  clearErrors: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "sams_mock_auth_user";
const TOKEN_STORAGE_KEY = "sams_mock_auth_token";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [deviceLimitError, setDeviceLimitError] = useState<{ message: string } | null>(null);
  const [requires2FA, setRequires2FA] = useState<boolean>(false);
  const [pendingEmail, setPendingEmail] = useState<string>("");

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, [user]);

  const clearErrors = () => {
    setDeviceLimitError(null);
    setRequires2FA(false);
  };

  const login = async (emailOrReq: string | LoginRequest, passwordArg?: string): Promise<User> => {
    setIsLoading(true);
    clearErrors();

    const req: LoginRequest =
      typeof emailOrReq === "string"
        ? { email: emailOrReq, password: passwordArg || "" }
        : emailOrReq;

    try {
      const response = await authApi.login(req);

      if (response.user) {
        setUser(response.user);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(response.user));
        localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
        return response.user;
      }

      throw new ApiError("Login failed", "AUTH_FAILED");
    } catch (err: any) {
      if (err.code === "DEVICE_LIMIT_REACHED" || err.status === 423) {
        setDeviceLimitError({
          message: err.message || "Account is active on another primary device (423 DEVICE_LIMIT_REACHED).",
        });
      } else if (err.code === "REQUIRES_2FA") {
        setRequires2FA(true);
        setPendingEmail(req.email);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verify2FA = async (code: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.verify2FA(pendingEmail, code);
      setUser(res.user);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.user));
      localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
      setRequires2FA(false);
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: { name: string; email: string; phone: string; password?: string }): Promise<User> => {
    setIsLoading(true);
    try {
      const newUser: User = {
        id: Date.now(),
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: "student",
        status: "active",
        twofaEnabled: false,
        createdAt: new Date().toISOString(),
      };
      setUser(newUser);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser));
      return newUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      setUser(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setIsLoading(false);
    }
  };

  const updateUser = (updated: Partial<User>) => {
    if (user) {
      const next = { ...user, ...updated };
      setUser(next);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? user.role : null,
        isAuthenticated: !!user,
        isLoading,
        deviceLimitError,
        requires2FA,
        login,
        register,
        verify2FA,
        logout,
        updateUser,
        clearErrors,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
