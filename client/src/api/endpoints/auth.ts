import { CONFIG } from "../../config";
import { apiFetch, mockLatency, ApiError } from "../client";
import { User, UserDevice } from "../../types";
import { MOCK_USERS } from "../../mock-data";

export interface LoginRequest {
  email: string;
  password: string;
  twofaCode?: string;
  deviceToken?: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  deviceToken: string;
  requires2FA?: boolean;
  requiresReverify?: boolean;
}

export const authApi = {
  async login(req: LoginRequest): Promise<LoginResponse> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);

      // Special mock error simulations
      if (req.email.includes("+limit")) {
        throw new ApiError(
          "Device limit reached. SAMS Academy policy permits maximum 2 registered devices. Please contact support/admin to reset your registered devices.",
          "DEVICE_LIMIT_REACHED",
          423
        );
      }
      if (req.email.includes("+2fa") && !req.twofaCode) {
        throw new ApiError("2FA code required. Please enter the 6-digit TOTP code.", "REQUIRES_2FA", 401);
      }
      if (req.email.includes("+suspicious") || req.email.includes("+reverify")) {
        throw new ApiError(
          "Suspicious login detected from an unrecognized IP address. A 6-digit verification code has been emailed to you.",
          "REVERIFY_REQUIRED",
          401
        );
      }
      if (req.email.includes("+locked")) {
        throw new ApiError(
          "Account temporarily locked due to 6 consecutive failed login attempts. Retry after 15 minutes or reset your password.",
          "ACCOUNT_LOCKED",
          423
        );
      }

      // Admin demo account
      if (req.email === "admin@samsacademy.com" && req.password === "Admin@12345") {
        const adminUser = MOCK_USERS.find((u) => u.role === "admin")!;
        return {
          user: adminUser,
          token: "mock-jwt-admin-token-12345",
          deviceToken: "mock-device-admin-token",
        };
      }

      // Student demo account
      if (req.email === "student@samsacademy.com" && req.password === "Student@123") {
        const studentUser = MOCK_USERS.find((u) => u.role === "student")!;
        return {
          user: studentUser,
          token: "mock-jwt-student-token-67890",
          deviceToken: "mock-device-student-token",
        };
      }

      // Fallback for demo flexibility: allow any email if password is "password"
      if (req.password === "Student@123" || req.password === "password" || req.password === "Admin@12345") {
        const role = req.email.includes("admin") ? "admin" : "student";
        const user: User = {
          id: Math.floor(Math.random() * 1000) + 10,
          name: req.email.split("@")[0].replace(".", " "),
          email: req.email,
          role: role,
          status: "active",
          emailVerifiedAt: new Date().toISOString(),
          twofaEnabled: false,
          createdAt: new Date().toISOString(),
        };
        return {
          user,
          token: `mock-jwt-${role}-token-custom`,
          deviceToken: "mock-device-custom-token",
        };
      }

      throw new ApiError("Invalid email or password. Please verify credentials.", "INVALID_CREDENTIALS", 401);
    }

    return apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  async verify2FA(email: string, code: string): Promise<LoginResponse> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const studentUser = MOCK_USERS.find((u) => u.role === "student")!;
      return {
        user: studentUser,
        token: "mock-jwt-2fa-verified-token",
        deviceToken: "mock-device-verified",
      };
    }
    return apiFetch<LoginResponse>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  },

  async register(data: { name: string; email: string; password: string; phone?: string }): Promise<{ message: string }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 500);
      if (data.email === "student@samsacademy.com" || data.email === "admin@samsacademy.com") {
        throw new ApiError("Email address is already registered.", "EMAIL_EXISTS", 409);
      }
      return { message: "Registration successful! Please check your email for the verification link." };
    }
    return apiFetch<{ message: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getCurrentUser(): Promise<User> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      const savedUserJson = localStorage.getItem("sams_mock_auth_user");
      if (savedUserJson) {
        return JSON.parse(savedUserJson);
      }
      return MOCK_USERS[0];
    }
    return apiFetch<User>("/auth/me");
  },

  async logout(): Promise<{ success: boolean }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 200);
      localStorage.removeItem("sams_mock_auth_user");
      localStorage.removeItem("sams_mock_auth_token");
      return { success: true };
    }
    return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
  },

  async getDevices(): Promise<UserDevice[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return [
        {
          id: 1,
          userId: 1,
          deviceName: "Windows 11 PC (Chrome 126)",
          lastIp: "182.180.142.12",
          lastSeenAt: new Date().toISOString(),
          isActive: true,
          isCurrent: true,
        },
      ];
    }
    return apiFetch<UserDevice[]>("/auth/devices");
  },

  async setup2FA(): Promise<{ qrCodeUrl: string; secret: string }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 350);
      return {
        qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=otpauth://totp/SAMS%20Academy:student@samsacademy.com?secret=JBSWY3DPEHPK3PXP&issuer=SAMS%20Academy",
        secret: "JBSWY3DPEHPK3PXP",
      };
    }
    return apiFetch<{ qrCodeUrl: string; secret: string }>("/auth/2fa/setup", { method: "POST" });
  },

  async enable2FA(code: string): Promise<{ backupCodes: string[] }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);
      if (code !== "123456" && code.length !== 6) {
        throw new ApiError("Invalid verification code. Try '123456'.", "INVALID_2FA_CODE", 400);
      }
      return {
        backupCodes: ["A1B2-C3D4", "E5F6-G7H8", "I9J0-K1L2", "M3N4-O5P6"],
      };
    }
    return apiFetch<{ backupCodes: string[] }>("/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);
      return {
        message: "If an account exists for " + email + ", password reset instructions have been sent.",
      };
    }
    return apiFetch<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 500);
      if (token === "invalid" || token === "expired") {
        throw new ApiError("The password reset link is invalid or has expired.", "INVALID_TOKEN", 400);
      }
      return {
        message: "Password reset successful. You may now log in with your new password.",
      };
    }
    return apiFetch<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });
  },

  async verifyEmailToken(token: string): Promise<{ success: boolean; message: string }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);
      if (token === "invalid" || token === "expired") {
        throw new ApiError("Email verification link is invalid or expired. Please request a new link.", "INVALID_TOKEN", 400);
      }
      return {
        success: true,
        message: "Email address verified successfully!",
      };
    }
    return apiFetch<{ success: boolean; message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  async reverifyLogin(email: string, code: string): Promise<LoginResponse> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 400);
      if (code !== "123456" && code.length !== 6) {
        throw new ApiError("Invalid 6-digit email confirmation code. Try '123456'.", "INVALID_CODE", 400);
      }
      const studentUser = MOCK_USERS.find((u) => u.role === "student")!;
      return {
        user: studentUser,
        token: "mock-jwt-reverified-token",
        deviceToken: "mock-device-reverified",
      };
    }
    return apiFetch<LoginResponse>("/auth/reverify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  },
};
