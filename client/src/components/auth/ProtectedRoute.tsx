import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../stores/authStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<"student" | "admin">;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  // The real session lives in an httpOnly cookie, not anything readable
  // client-side — until the initial `GET /auth/me` bootstrap check (see
  // authStore.tsx's AuthProvider) resolves, `isAuthenticated` is not yet
  // trustworthy. Show a neutral loading state instead of redirecting, so a
  // valid session never flashes a logged-out UI and an actually-expired one
  // never briefly renders protected content.
  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-500">Verifying your session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If student tries to access admin, redirect to student dashboard
    if (user.role === "student") {
      return <Navigate to="/app" replace />;
    }
    // If admin, redirect to admin
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
};
