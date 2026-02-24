import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Edit, Loader2, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Profile, AppRole, UserRole } from '@/types/clinic';
import { PageHeader } from '@/components/layout/PageHeader';

interface StaffMember extends Profile {
  user_roles?: UserRole[];
}

export default function Staff() {
  const { hasRole, user } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRole>('receptionist');

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setIsLoading(true);
    
    // Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      toast({ variant: 'destructive', title: 'Error', description: profilesError.message });
      setIsLoading(false);
      return;
    }

    // Fetch user roles
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*');

    if (rolesError) {
      toast({ variant: 'destructive', title: 'Error', description: rolesError.message });
      setIsLoading(false);
      return;
    }

    // Combine profiles with roles
    const staffWithRoles = (profiles as Profile[]).map((profile) => ({
      ...profile,
      user_roles: (roles as UserRole[]).filter((r) => r.user_id === profile.id),
    }));

    setStaff(staffWithRoles);
    setIsLoading(false);
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setIsSaving(true);

    // First, remove existing role if any
    await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', editingStaff.id);

    // Then insert new role
    const { error } = await supabase
      .from('user_roles')
      .insert([{
        user_id: editingStaff.id,
        role: selectedRole,
      }]);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Success', description: 'Role assigned successfully' });
      setIsDialogOpen(false);
      setEditingStaff(null);
      fetchStaff();
    }
    setIsSaving(false);
  };

  const handleEdit = (staffMember: StaffMember) => {
    setEditingStaff(staffMember);
    setSelectedRole(staffMember.user_roles?.[0]?.role || 'receptionist');
    setIsDialogOpen(true);
  };

  const filteredStaff = staff.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeColor = (role?: AppRole) => {
    switch (role) {
      case 'admin':
        return 'bg-destructive/10 text-destructive';
      case 'doctor':
        return 'bg-primary/10 text-primary';
      case 'pharmacist':
        return 'bg-accent/10 text-accent';
      case 'receptionist':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (!hasRole(['admin'])) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">Only administrators can manage staff.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Staff Management"
        subtitle="Manage staff accounts and roles"
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search staff..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredStaff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No staff members found
                </TableCell>
              </TableRow>
            ) : (
              filteredStaff.map((staffMember) => {
                const currentRole = staffMember.user_roles?.[0]?.role;
                return (
                  <TableRow key={staffMember.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                          <span className="text-sm font-medium text-primary">
                            {staffMember.full_name?.charAt(0) || staffMember.email.charAt(0)}
                          </span>
                        </div>
                        <span>{staffMember.full_name || 'Unnamed'}</span>
                      </div>
                    </TableCell>
                    <TableCell>{staffMember.email}</TableCell>
                    <TableCell>
                      {currentRole ? (
                        <span className={`status-badge capitalize ${getRoleBadgeColor(currentRole)}`}>
                          {currentRole}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">No role assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(staffMember.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {staffMember.id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(staffMember)}
                        >
                          <UserCog className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Assign Role Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) setEditingStaff(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
          </DialogHeader>
          {editingStaff && (
            <form onSubmit={handleAssignRole} className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Staff Member</p>
                <p className="font-medium">{editingStaff.full_name || editingStaff.email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={selectedRole}
                  onValueChange={(value: AppRole) => setSelectedRole(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="doctor">Doctor</SelectItem>
                    <SelectItem value="pharmacist">Pharmacist</SelectItem>
                    <SelectItem value="receptionist">Receptionist</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">Role Permissions:</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {selectedRole === 'admin' && (
                    <>
                      <li>• Full access to all features</li>
                      <li>• Can manage staff and roles</li>
                    </>
                  )}
                  {selectedRole === 'doctor' && (
                    <>
                      <li>• View and create patients</li>
                      <li>• Create visits and prescriptions</li>
                    </>
                  )}
                  {selectedRole === 'pharmacist' && (
                    <>
                      <li>• View prescriptions and dispense</li>
                      <li>• Manage medicine inventory</li>
                    </>
                  )}
                  {selectedRole === 'receptionist' && (
                    <>
                      <li>• View and create patients</li>
                      <li>• View visits</li>
                    </>
                  )}
                </ul>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Assign Role
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
