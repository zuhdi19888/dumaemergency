import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Calendar, 
  FileText, 
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Pill
} from 'lucide-react';
import type { DashboardStats, Medicine, Visit } from '@/types/clinic';

export default function Dashboard() {
  const { profile, role } = useAuth();
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
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);

    // Fetch patient count
    const { count: patientCount } = await supabase
      .from('patients')
      .select('*', { count: 'exact', head: true });

    // Fetch today's visits
    const today = new Date().toISOString().split('T')[0];
    const { count: todayVisitCount } = await supabase
      .from('visits')
      .select('*', { count: 'exact', head: true })
      .gte('visit_date', today)
      .lt('visit_date', today + 'T23:59:59');

    // Fetch pending prescriptions
    const { count: pendingPrescriptionCount } = await supabase
      .from('prescriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Fetch low stock medicines
    const { data: lowStock } = await supabase
      .from('medicines')
      .select('*')
      .filter('stock_quantity', 'lte', supabase.rpc ? 10 : 10);

    // Actually filter low stock properly
    const { data: allMedicines } = await supabase
      .from('medicines')
      .select('*');

    const lowStockMeds = allMedicines?.filter(
      m => m.stock_quantity <= m.low_stock_threshold
    ) || [];

    // Fetch recent visits with patient info
    const { data: visits } = await supabase
      .from('visits')
      .select(`
        *,
        patient:patients(first_name, last_name)
      `)
      .order('visit_date', { ascending: false })
      .limit(5);

    setStats({
      totalPatients: patientCount || 0,
      todayVisits: todayVisitCount || 0,
      pendingPrescriptions: pendingPrescriptionCount || 0,
      lowStockMedicines: lowStockMeds.length,
    });

    setRecentVisits(visits as Visit[] || []);
    setLowStockItems(lowStockMeds.slice(0, 5));
    setIsLoading(false);
  };

  const statCards = [
    {
      title: 'Total Patients',
      value: stats.totalPatients,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      href: '/patients',
      roles: ['admin', 'doctor', 'receptionist'],
    },
    {
      title: "Today's Visits",
      value: stats.todayVisits,
      icon: Calendar,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      href: '/visits',
      roles: ['admin', 'doctor', 'receptionist'],
    },
    {
      title: 'Pending Prescriptions',
      value: stats.pendingPrescriptions,
      icon: FileText,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      href: '/prescriptions',
      roles: ['admin', 'doctor', 'pharmacist'],
    },
    {
      title: 'Low Stock Items',
      value: stats.lowStockMedicines,
      icon: AlertTriangle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      href: '/alerts',
      roles: ['admin', 'pharmacist'],
    },
  ];

  const visibleStatCards = statCards.filter(
    card => role && (card.roles.includes(role) || role === 'admin')
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-header">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back, {profile?.full_name || 'User'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleStatCards.map((stat) => (
          <Link key={stat.title} to={stat.href}>
            <Card className="stat-card group cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">
                      {isLoading ? '...' : stat.value}
                    </p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm text-muted-foreground group-hover:text-primary">
                  <span>View details</span>
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Visits */}
        {(role === 'admin' || role === 'doctor' || role === 'receptionist') && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Recent Visits</CardTitle>
              <Link to="/visits">
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentVisits.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No visits recorded yet
                </p>
              ) : (
                <div className="space-y-4">
                  {recentVisits.map((visit) => (
                    <div
                      key={visit.id}
                      className="flex items-center justify-between rounded-lg border border-border/50 p-3"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {(visit as any).patient?.first_name} {(visit as any).patient?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {visit.chief_complaint || 'General checkup'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`status-badge ${
                          visit.status === 'completed' ? 'status-completed' :
                          visit.status === 'cancelled' ? 'status-cancelled' :
                          'status-pending'
                        }`}>
                          {visit.status}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
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

        {/* Low Stock Alerts */}
        {(role === 'admin' || role === 'pharmacist') && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Low Stock Alerts</CardTitle>
              <Link to="/alerts">
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowRight className="ml-1 h-4 w-4" />
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
                    All items are well stocked
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lowStockItems.map((medicine) => (
                    <div
                      key={medicine.id}
                      className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
                          <Pill className="h-4 w-4 text-destructive" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{medicine.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Threshold: {medicine.low_stock_threshold}
                          </p>
                        </div>
                      </div>
                      <span className="low-stock rounded-lg px-3 py-1">
                        {medicine.stock_quantity} left
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
