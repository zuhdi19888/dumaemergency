import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { loadVisitPayments } from '@/lib/visitPayments';
import { Users, Calendar, FileText, AlertTriangle, TrendingUp, ArrowRight, Pill } from 'lucide-react';
import type { DashboardStats, Medicine, Visit } from '@/types/clinic';

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});

export default function Dashboard() {
  const { profile, role } = useAuth();
  const { t } = useLanguage();
  const [visitCollectorNames, setVisitCollectorNames] = useState<Record<string, string>>({});

  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    todayVisits: 0,
    pendingPrescriptions: 0,
    lowStockMedicines: 0,
  });
  const [recentVisits, setRecentVisits] = useState<Visit[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void fetchDashboardData();
  }, []);

  const fetchCollectorNames = async (visits: Visit[]) => {
    const collectorIds = Array.from(
      new Set(
        visits
          .map((visit) => visit.paid_collected_by || visit.doctor_id || visit.created_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (collectorIds.length === 0) {
      setVisitCollectorNames({});
      return;
    }

    const { data: profilesData, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', collectorIds);

    if (error) {
      setVisitCollectorNames({});
      return;
    }

    const profilesMap = ((profilesData as Array<{ id: string; full_name: string | null; email: string }> | null) ?? [])
      .reduce<Record<string, { full_name: string | null; email: string }>>((acc, item) => {
        acc[item.id] = { full_name: item.full_name, email: item.email };
        return acc;
      }, {});

    const collectorMap = visits.reduce<Record<string, string>>((acc, visit) => {
      const collectorId = visit.paid_collected_by || visit.doctor_id || visit.created_by;
      if (!collectorId) {
        acc[visit.id] = t('غير محدد', 'Unassigned');
        return acc;
      }
      const collector = profilesMap[collectorId];
      acc[visit.id] = collector?.full_name || collector?.email || t('غير محدد', 'Unassigned');
      return acc;
    }, {});

    setVisitCollectorNames(collectorMap);
  };

  const fetchDashboardData = async () => {
    setIsLoading(true);

    const today = new Date().toISOString().split('T')[0];

    const [patientsRes, todayVisitsRes, prescriptionsRes, medicinesRes, recentVisitsRes] = await Promise.all([
      supabase.from('patients').select('*', { count: 'exact', head: true }),
      supabase
        .from('visits')
        .select('*', { count: 'exact', head: true })
        .gte('visit_date', today)
        .lt('visit_date', `${today}T23:59:59`),
      supabase.from('prescriptions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('medicines').select('*'),
      supabase
        .from('visits')
        .select(`
          *,
          patient:patients(first_name, last_name)
        `)
        .order('visit_date', { ascending: false })
        .limit(5),
    ]);

    const allMedicines = (medicinesRes.data as Medicine[] | null) ?? [];
    const lowStockMeds = allMedicines.filter((item) => item.stock_quantity <= item.low_stock_threshold);

    setStats({
      totalPatients: patientsRes.count || 0,
      todayVisits: todayVisitsRes.count || 0,
      pendingPrescriptions: prescriptionsRes.count || 0,
      lowStockMedicines: lowStockMeds.length,
    });

    const recentVisitsData = ((recentVisitsRes.data as Visit[] | null) ?? []);
    const recentVisitIds = recentVisitsData.map((visit) => visit.id);
    let mergedRecentVisits = recentVisitsData;
    let collectorNamesFromPayments: Record<string, string> | null = null;

    if (recentVisitIds.length > 0) {
      const paymentsResult = await loadVisitPayments(supabase, {
        completedOnly: false,
        visitIds: recentVisitIds,
        includeZeroPayments: true,
        persistParsedAmounts: true,
      });

      if (!paymentsResult.errorMessage) {
        const paymentsMap = paymentsResult.payments.reduce<Record<string, (typeof paymentsResult.payments)[number]>>(
          (acc, payment) => {
            acc[payment.id] = payment;
            return acc;
          },
          {},
        );

        mergedRecentVisits = recentVisitsData.map((visit) => {
          const payment = paymentsMap[visit.id];
          if (!payment) return visit;

          const collectorId = payment.collector?.id || visit.paid_collected_by || visit.doctor_id || visit.created_by || null;
          return {
            ...visit,
            paid_amount: Number(payment.paid_amount) || 0,
            paid_collected_by: collectorId,
          };
        });

        collectorNamesFromPayments = mergedRecentVisits.reduce<Record<string, string>>((acc, visit) => {
          const payment = paymentsMap[visit.id];
          const fallbackLabel = t('غير محدد', 'Unassigned');
          acc[visit.id] = payment?.collector?.full_name || payment?.collector?.email || fallbackLabel;
          return acc;
        }, {});
      }
    }

    setRecentVisits(mergedRecentVisits);
    if (collectorNamesFromPayments) {
      setVisitCollectorNames(collectorNamesFromPayments);
    } else {
      await fetchCollectorNames(mergedRecentVisits);
    }
    setLowStockItems(lowStockMeds.slice(0, 5));
    setIsLoading(false);
  };

  const statCards = [
    {
      title: t('إجمالي المرضى', 'Total Patients'),
      value: stats.totalPatients,
      icon: Users,
      href: '/patients',
      roles: ['admin', 'doctor', 'receptionist'],
      iconGradient: 'from-[#22c7bf] to-[#20aecf]',
      iconShadow: 'shadow-[0_16px_30px_-14px_rgba(32,174,207,0.85)]',
    },
    {
      title: t('زيارات اليوم', "Today's Visits"),
      value: stats.todayVisits,
      icon: Calendar,
      href: '/visits',
      roles: ['admin', 'doctor', 'receptionist'],
      iconGradient: 'from-[#f3b400] to-[#e8a100]',
      iconShadow: 'shadow-[0_16px_30px_-14px_rgba(232,161,0,0.85)]',
    },
    {
      title: t('الوصفات المعلقة', 'Pending Prescriptions'),
      value: stats.pendingPrescriptions,
      icon: FileText,
      href: '/prescriptions',
      roles: ['admin', 'doctor', 'pharmacist'],
      iconGradient: 'from-[#22a8e2] to-[#2d88ea]',
      iconShadow: 'shadow-[0_16px_30px_-14px_rgba(45,136,234,0.85)]',
    },
    {
      title: t('أصناف منخفضة المخزون', 'Low Stock Items'),
      value: stats.lowStockMedicines,
      icon: AlertTriangle,
      href: '/alerts',
      roles: ['admin', 'pharmacist'],
      iconGradient: 'from-[#ff5d3f] to-[#ff7a1d]',
      iconShadow: 'shadow-[0_16px_30px_-14px_rgba(255,122,29,0.85)]',
    },
  ];

  const visibleStatCards = statCards.filter(
    (card) => role && (card.roles.includes(role) || role === 'admin'),
  );

  const getVisitStatusLabel = (status: Visit['status']) => {
    if (status === 'completed') return t('مكتملة', 'Completed');
    if (status === 'cancelled') return t('ملغاة', 'Cancelled');
    if (status === 'in_progress') return t('قيد التنفيذ', 'In Progress');
    return t('قيد الانتظار', 'Pending');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('لوحة التحكم', 'Dashboard')}
        subtitle={`${t('مرحبًا،', 'Welcome back,')} ${profile?.full_name || t('مستخدم', 'User')}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleStatCards.map((stat) => (
          <Link key={stat.title} to={stat.href}>
            <Card className="group cursor-pointer rounded-3xl border border-[#e6eef3] bg-[#f7fbfd] shadow-[0_20px_40px_-30px_rgba(34,114,145,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_26px_44px_-28px_rgba(34,114,145,0.6)]">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#476a80]">{stat.title}</p>
                    <p className="mt-2 text-[3rem] font-bold leading-none text-[#0f2230]">
                      {isLoading ? '...' : stat.value}
                    </p>
                  </div>
                  <div
                    className={`flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-gradient-to-br ${stat.iconGradient} ${stat.iconShadow}`}
                  >
                    <stat.icon className="h-8 w-8 text-white" />
                  </div>
                </div>
                <div className="mt-5 flex items-center text-sm text-[#4f6f84] transition-colors group-hover:text-[#20a8b8]">
                  <span>{t('عرض التفاصيل', 'View details')}</span>
                  <ArrowRight className="mr-1 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {(role === 'admin' || role === 'doctor' || role === 'receptionist') && (
          <Card className="rounded-3xl border border-[#e6eef3] bg-[#f8fbfd] shadow-[0_20px_40px_-30px_rgba(34,114,145,0.38)]">
            <CardHeader className="flex flex-row items-center justify-between border-b border-[#e7eff4]">
              <CardTitle className="text-lg font-semibold text-[#22394a]">{t('آخر الزيارات', 'Recent Visits')}</CardTitle>
              <Link to="/visits">
                <Button size="sm" className="btn-gradient-teal h-8 px-3 text-xs">
                  {t('عرض الكل', 'View All')}
                  <ArrowRight className="mr-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentVisits.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('لا توجد زيارات حتى الآن', 'No visits recorded yet')}
                </p>
              ) : (
                <div className="space-y-4">
                  {recentVisits.map((visit) => (
                    <div
                      key={visit.id}
                      className="flex items-center justify-between rounded-xl border border-[#e4ecf1] bg-white/70 p-3"
                    >
                      <div>
                        <p className="font-medium text-[#1d3649]">
                          {(visit as any).patient?.first_name} {(visit as any).patient?.last_name}
                        </p>
                        <p className="text-sm text-[#5d7a8d]">
                          {visit.chief_complaint || t('فحص عام', 'General checkup')}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`status-badge ${
                            visit.status === 'completed'
                              ? 'status-completed'
                              : visit.status === 'cancelled'
                                ? 'status-cancelled'
                                : 'status-pending'
                          }`}
                        >
                          {getVisitStatusLabel(visit.status)}
                        </span>
                        <p className="mt-1 text-sm font-semibold text-[#0a9a6d]">
                          {t('المدفوع', 'Paid')}: {currencyFormatter.format(Number(visit.paid_amount) || 0)}
                        </p>
                        <p className="mt-1 text-xs text-[#6b8597]">
                          {t('الطبيب المستلم', 'Receiving Doctor')}: {visitCollectorNames[visit.id] || t('غير محدد', 'Unassigned')}
                        </p>
                        <p className="mt-1 text-xs text-[#6b8597]">
                          {new Date(visit.visit_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(role === 'admin' || role === 'pharmacist') && (
          <Card className="rounded-3xl border border-[#e6eef3] bg-[#f8fbfd] shadow-[0_20px_40px_-30px_rgba(34,114,145,0.38)]">
            <CardHeader className="flex flex-row items-center justify-between border-b border-[#e7eff4]">
              <CardTitle className="text-lg font-semibold text-[#22394a]">{t('تنبيهات نقص المخزون', 'Low Stock Alerts')}</CardTitle>
              <Link to="/alerts">
                <Button size="sm" className="btn-gradient-teal h-8 px-3 text-xs">
                  {t('عرض الكل', 'View All')}
                  <ArrowRight className="mr-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {lowStockItems.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                    <TrendingUp className="h-6 w-6 text-success" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t('جميع الأصناف متوفرة بشكل جيد', 'All items are well stocked')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lowStockItems.map((medicine) => (
                    <div
                      key={medicine.id}
                      className="flex items-center justify-between rounded-xl border border-[#ffd6cc] bg-[#fff8f6] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ffe5dd]">
                          <Pill className="h-4 w-4 text-[#f15a2a]" />
                        </div>
                        <div>
                          <p className="font-medium text-[#1d3649]">{medicine.name}</p>
                          <p className="text-sm text-[#5d7a8d]">
                            {t('حد التنبيه:', 'Threshold:')} {medicine.low_stock_threshold}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-lg bg-[#ffece6] px-3 py-1 text-sm font-semibold text-[#e85d34]">
                        {t('المتبقي:', 'Left:')} {medicine.stock_quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
