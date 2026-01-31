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
  Stethoscope
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'doctor', 'pharmacist', 'receptionist'] },
  { name: 'Patients', href: '/patients', icon: Users, roles: ['admin', 'doctor', 'receptionist'] },
  { name: 'Visits', href: '/visits', icon: Calendar, roles: ['admin', 'doctor', 'receptionist'] },
  { name: 'Prescriptions', href: '/prescriptions', icon: FileText, roles: ['admin', 'doctor', 'pharmacist'] },
  { name: 'Inventory', href: '/inventory', icon: Pill, roles: ['admin', 'pharmacist'] },
  { name: 'Low Stock Alerts', href: '/alerts', icon: AlertTriangle, roles: ['admin', 'pharmacist'] },
  { name: 'Staff', href: '/staff', icon: UserCog, roles: ['admin'] },
];

export function Sidebar() {
  const location = useLocation();
  const { role, profile, signOut } = useAuth();

  const filteredNavigation = navigation.filter(
    item => role && (item.roles.includes(role) || role === 'admin')
  );

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Stethoscope className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">MediClinic</span>
            <span className="text-xs text-muted-foreground">Management System</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {filteredNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'sidebar-link',
                  isActive && 'sidebar-link-active'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <span className="text-sm font-medium text-primary">
                {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {profile?.full_name || 'User'}
              </p>
              <p className="truncate text-xs text-muted-foreground capitalize">
                {role || 'Unknown Role'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </aside>
  );
}
