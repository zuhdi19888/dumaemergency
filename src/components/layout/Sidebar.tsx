import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  Pill,
  AlertTriangle,
  UserCog,
  LogOut,
  Sparkles,
  Wallet,
  CircleDollarSign,
  Receipt,
  BarChart3,
  HardDriveDownload,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import clinicLogo from '@/assets/clinic-logo.jpeg';

const mainNavigation = [
  {
    name: { ar: 'لوحة التحكم', en: 'Dashboard' },
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'doctor', 'pharmacist', 'receptionist'],
  },
  {
    name: { ar: 'المرضى', en: 'Patients' },
    href: '/patients',
    icon: Users,
    roles: ['admin', 'doctor', 'receptionist'],
  },
  {
    name: { ar: 'الزيارات', en: 'Visits' },
    href: '/visits',
    icon: Calendar,
    roles: ['admin', 'doctor', 'receptionist'],
  },
  {
    name: { ar: 'الوصفات', en: 'Prescriptions' },
    href: '/prescriptions',
    icon: FileText,
    roles: ['admin', 'doctor', 'pharmacist'],
  },
  {
    name: { ar: 'كتابة تقرير طبي', en: 'Medical Report' },
    href: '/medical-report',
    icon: FileText,
    roles: ['admin', 'doctor'],
  },
  {
    name: { ar: 'المخزون', en: 'Inventory' },
    href: '/inventory',
    icon: Pill,
    roles: ['admin', 'pharmacist'],
  },
  {
    name: { ar: 'تنبيهات النقص', en: 'Low Stock Alerts' },
    href: '/alerts',
    icon: AlertTriangle,
    roles: ['admin', 'pharmacist'],
  },
  {
    name: { ar: 'الطاقم', en: 'Staff' },
    href: '/staff',
    icon: UserCog,
    roles: ['admin'],
  },
  {
    name: { ar: 'النسخ الاحتياطي', en: 'Backup' },
    href: '/backup',
    icon: HardDriveDownload,
    roles: ['admin', 'doctor'],
  },
  {
    name: { ar: 'الإعدادات', en: 'Settings' },
    href: '/settings',
    icon: Settings,
    roles: ['admin', 'doctor', 'pharmacist', 'receptionist'],
  },
];

const financeNavigation = [
  {
    name: { ar: 'الرصيد', en: 'Balance' },
    href: '/finance/balance',
    icon: Wallet,
    roles: ['admin'],
  },
  {
    name: { ar: 'الدخل', en: 'Income' },
    href: '/finance/income',
    icon: CircleDollarSign,
    roles: ['admin'],
  },
  {
    name: { ar: 'المصروفات', en: 'Expenses' },
    href: '/finance/expenses',
    icon: Receipt,
    roles: ['admin'],
  },
  {
    name: { ar: 'التقارير', en: 'Reports' },
    href: '/finance/reports',
    icon: BarChart3,
    roles: ['admin'],
  },
];

export function Sidebar() {
  const location = useLocation();
  const { role, profile, signOut } = useAuth();
  const { language, t } = useLanguage();

  const getRoleLabel = (currentRole: string | null) => {
    if (currentRole === 'admin') return t('مدير', 'Admin');
    if (currentRole === 'doctor') return t('طبيب', 'Doctor');
    if (currentRole === 'pharmacist') return t('صيدلي', 'Pharmacist');
    if (currentRole === 'receptionist') return t('استقبال', 'Receptionist');
    return t('غير معروف', 'Unknown');
  };

  const filteredNavigation = mainNavigation.filter(
    (item) => role && (item.roles.includes(role) || role === 'admin'),
  );
  const filteredFinanceNavigation = financeNavigation.filter(
    (item) => role && (item.roles.includes(role) || role === 'admin'),
  );

  return (
    <aside className={`glass-sidebar fixed top-0 z-40 h-screen w-64 border-white/20 ${language === 'ar' ? 'right-0 border-l' : 'left-0 border-r'}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-6">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-teal-400 to-amber-400 blur opacity-40" />
            <img
              src={clinicLogo}
              alt={t('مركز طوارئ دوما', 'Duma Emergency Center')}
              className="relative h-12 w-12 rounded-full border-2 border-white object-cover shadow-lg"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-gradient-teal">{t('مركز طوارئ دوما', 'Duma Emergency Center')}</span>
            <span className="text-xs text-muted-foreground">{t('نظام إدارة العيادة', 'Clinic Management')}</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <div className="mb-3 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-teal-500" />
            {t('القائمة الرئيسية', 'Main Menu')}
          </div>

          {filteredNavigation.map((item, index) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn('sidebar-link animate-scroll-fade-up opacity-0', isActive && 'sidebar-link-active')}
                style={{
                  animationDelay: `${index * 50}ms`,
                  animationFillMode: 'forwards',
                }}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{language === 'ar' ? item.name.ar : item.name.en}</span>
              </Link>
            );
          })}

          {filteredFinanceNavigation.length > 0 && (
            <>
              <div className="mb-3 mt-6 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Wallet className="h-3 w-3 text-amber-500" />
                {t('القسم المالي', 'Financial')}
              </div>
              {filteredFinanceNavigation.map((item, index) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn('sidebar-link animate-scroll-fade-up opacity-0', isActive && 'sidebar-link-active')}
                    style={{
                      animationDelay: `${(index + filteredNavigation.length) * 50}ms`,
                      animationFillMode: 'forwards',
                    }}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{language === 'ar' ? item.name.ar : item.name.en}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 shadow-lg">
              <span className="text-sm font-bold text-white">
                {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || t('م', 'U')}
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-foreground">{profile?.full_name || t('مستخدم', 'User')}</p>
              <p className="truncate text-xs text-muted-foreground">{getRoleLabel(role)}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start rounded-xl text-muted-foreground transition-all hover:bg-red-50 hover:text-red-500"
          >
            <LogOut className={`${language === 'ar' ? 'ml-2' : 'mr-2'} h-4 w-4`} />
            {t('تسجيل الخروج', 'Sign Out')}
          </Button>
        </div>
      </div>
    </aside>
  );
}
