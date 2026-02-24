import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import { GlobalFooter } from "@/components/layout/GlobalFooter";

// Auth Pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

// App Pages
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import PatientDetails from "./pages/PatientDetails";
import Visits from "./pages/Visits";
import Prescriptions from "./pages/Prescriptions";
import Inventory from "./pages/Inventory";
import LowStockAlerts from "./pages/LowStockAlerts";
import Staff from "./pages/Staff";
import Backup from "./pages/Backup";
import Settings from "./pages/Settings";
import MedicalReport from "./pages/MedicalReport";
import FinanceBalance from "./pages/finance/Balance";
import FinanceIncome from "./pages/finance/Income";
import FinanceExpenses from "./pages/finance/Expenses";
import FinanceReports from "./pages/finance/Reports";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <LanguageProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
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
                path="/patients/:id"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'doctor', 'receptionist']}>
                    <PatientDetails />
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
              <Route
                path="/backup"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'doctor']}>
                    <Backup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'doctor', 'pharmacist', 'receptionist']}>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medical-report"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'doctor']}>
                    <MedicalReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance/balance"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <FinanceBalance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance/income"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <FinanceIncome />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance/expenses"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <FinanceExpenses />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance/reports"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <FinanceReports />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
            </Routes>
            <GlobalFooter />
          </AuthProvider>
        </BrowserRouter>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
