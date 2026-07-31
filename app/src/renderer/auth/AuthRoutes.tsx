import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./AuthProvider";

function AuthLoading() {
  return <div className="h-screen bg-canvas" />;
}

export function AuthGuard() {
  const { state } = useAuth();
  if (state === "checking") return <AuthLoading />;
  return state === "authenticated" ? <Outlet /> : <Navigate to="/login" replace />;
}

export function GuestGuard() {
  const { state } = useAuth();
  if (state === "checking") return <AuthLoading />;
  return state === "authenticated" ? <Navigate to="/inbox" replace /> : <Outlet />;
}
