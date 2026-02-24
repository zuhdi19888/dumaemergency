import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';
import type { AppRole } from '@/types/clinic';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, isLoading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">{t('بانتظار الصلاحيات', 'Access Pending')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('حسابك بانتظار تعيين الدور. يرجى التواصل مع المدير.', 'Your account is pending role assignment. Please contact an administrator.')}
          </p>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(role) && role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">{t('تم رفض الوصول', 'Access Denied')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('لا تملك صلاحية الوصول إلى هذه الصفحة.', "You don't have permission to access this page.")}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
