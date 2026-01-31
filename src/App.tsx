import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";

// Auth Pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

// App Pages
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Visits from "./pages/Visits";
import Prescriptions from "./pages/Prescriptions";
import Inventory from "./pages/Inventory";
import LowStockAlerts from "./pages/LowStockAlerts";
import Staff from "./pages/Staff";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Protected Routes */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route
                path="/patients"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'doctor', 'receptionist']}>
                    <Patients />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/visits"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'doctor', 'receptionist']}>
                    <Visits />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/prescriptions"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'doctor', 'pharmacist']}>
                    <Prescriptions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'pharmacist']}>
                    <Inventory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/alerts"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'pharmacist']}>
                    <LowStockAlerts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Staff />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
