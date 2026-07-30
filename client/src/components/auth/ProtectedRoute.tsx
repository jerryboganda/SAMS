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
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

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
