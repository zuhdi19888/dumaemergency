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
  DialogTrigger,
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
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Edit, Loader2, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Visit, Patient } from '@/types/clinic';

export default function Visits() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewingVisit, setViewingVisit] = useState<Visit | null>(null);

  const [formData, setFormData] = useState({
    patient_id: '',
    visit_date: new Date().toISOString().slice(0, 16),
    chief_complaint: '',
    diagnosis: '',
    notes: '',
    status: 'pending' as 'pending' | 'in_progress' | 'completed' | 'cancelled',
    vitals: {
      blood_pressure: '',
      temperature: '',
      pulse: '',
      weight: '',
      height: '',
    },
  });

  useEffect(() => {
    fetchVisits();
    fetchPatients();
  }, []);

  const fetchVisits = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('visits')
      .select(`
        *,
        patient:patients(id, first_name, last_name)
      `)
      .order('visit_date', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      setVisits(data as Visit[]);
    }
    setIsLoading(false);
  };

  const fetchPatients = async () => {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .order('last_name');
    if (data) setPatients(data as Patient[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const visitData = {
      ...formData,
      doctor_id: user?.id,
      created_by: user?.id,
    };

    let error;
    if (editingVisit) {
      const { error: updateError } = await supabase
        .from('visits')
        .update(visitData)
        .eq('id', editingVisit.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('visits')
        .insert([visitData]);
      error = insertError;
    }

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Success', description: `Visit ${editingVisit ? 'updated' : 'created'} successfully` });
      resetForm();
      setIsDialogOpen(false);
      fetchVisits();
    }
    setIsSaving(false);
  };

  const handleEdit = (visit: Visit) => {
    setEditingVisit(visit);
    setFormData({
      patient_id: visit.patient_id,
      visit_date: new Date(visit.visit_date).toISOString().slice(0, 16),
      chief_complaint: visit.chief_complaint || '',
      diagnosis: visit.diagnosis || '',
      notes: visit.notes || '',
      status: visit.status,
      vitals: {
        blood_pressure: visit.vitals?.blood_pressure || '',
        temperature: visit.vitals?.temperature || '',
        pulse: visit.vitals?.pulse || '',
        weight: visit.vitals?.weight || '',
        height: visit.vitals?.height || '',
      },
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingVisit(null);
    setFormData({
      patient_id: '',
      visit_date: new Date().toISOString().slice(0, 16),
      chief_complaint: '',
      diagnosis: '',
      notes: '',
      status: 'pending',
      vitals: {
        blood_pressure: '',
        temperature: '',
        pulse: '',
        weight: '',
        height: '',
      },
    });
  };

  const filteredVisits = visits.filter((v) => {
    const patientName = `${(v as any).patient?.first_name} ${(v as any).patient?.last_name}`.toLowerCase();
    return (
      patientName.includes(searchQuery.toLowerCase()) ||
      v.chief_complaint?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.diagnosis?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-header">Visits</h1>
          <p className="mt-1 text-muted-foreground">Manage patient visits and consultations</p>
        </div>
        {hasRole(['admin', 'doctor', 'receptionist']) && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Visit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingVisit ? 'Edit Visit' : 'New Visit'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="patient_id">Patient *</Label>
                  <Select
                    value={formData.patient_id}
                    onValueChange={(value) => setFormData({ ...formData, patient_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select patient" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="visit_date">Visit Date *</Label>
                    <Input
                      id="visit_date"
                      type="datetime-local"
                      value={formData.visit_date}
                      onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: 'pending' | 'in_progress' | 'completed' | 'cancelled') =>
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chief_complaint">Chief Complaint</Label>
                  <Textarea
                    id="chief_complaint"
                    value={formData.chief_complaint}
                    onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
                    placeholder="Patient's main complaint..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vitals</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Blood Pressure (e.g., 120/80)"
                      value={formData.vitals.blood_pressure}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, blood_pressure: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder="Temperature (°C)"
                      value={formData.vitals.temperature}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, temperature: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder="Pulse (bpm)"
                      value={formData.vitals.pulse}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, pulse: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder="Weight (kg)"
                      value={formData.vitals.weight}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, weight: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="diagnosis">Diagnosis</Label>
                  <Textarea
                    id="diagnosis"
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="Diagnosis..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingVisit ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search visits..."
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
              <TableHead>Patient</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Chief Complaint</TableHead>
              <TableHead>Diagnosis</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredVisits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No visits found
                </TableCell>
              </TableRow>
            ) : (
              filteredVisits.map((visit) => (
                <TableRow key={visit.id}>
                  <TableCell className="font-medium">
                    {(visit as any).patient?.first_name} {(visit as any).patient?.last_name}
                  </TableCell>
                  <TableCell>
                    {new Date(visit.visit_date).toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {visit.chief_complaint || '-'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {visit.diagnosis || '-'}
                  </TableCell>
                  <TableCell>
                    <span className={`status-badge ${
                      visit.status === 'completed' ? 'status-completed' :
                      visit.status === 'cancelled' ? 'status-cancelled' :
                      visit.status === 'in_progress' ? 'bg-info/10 text-info' :
                      'status-pending'
                    }`}>
                      {visit.status.replace('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewingVisit(visit)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {hasRole(['admin', 'doctor']) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(visit)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* View Visit Dialog */}
      <Dialog open={!!viewingVisit} onOpenChange={() => setViewingVisit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Visit Details</DialogTitle>
          </DialogHeader>
          {viewingVisit && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-medium">
                    {(viewingVisit as any).patient?.first_name} {(viewingVisit as any).patient?.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {new Date(viewingVisit.visit_date).toLocaleString()}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Chief Complaint</p>
                <p className="font-medium">{viewingVisit.chief_complaint || '-'}</p>
              </div>
              {viewingVisit.vitals && Object.keys(viewingVisit.vitals).length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Vitals</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {viewingVisit.vitals.blood_pressure && (
                      <p><span className="text-muted-foreground">BP:</span> {viewingVisit.vitals.blood_pressure}</p>
                    )}
                    {viewingVisit.vitals.temperature && (
                      <p><span className="text-muted-foreground">Temp:</span> {viewingVisit.vitals.temperature}°C</p>
                    )}
                    {viewingVisit.vitals.pulse && (
                      <p><span className="text-muted-foreground">Pulse:</span> {viewingVisit.vitals.pulse} bpm</p>
                    )}
                    {viewingVisit.vitals.weight && (
                      <p><span className="text-muted-foreground">Weight:</span> {viewingVisit.vitals.weight} kg</p>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Diagnosis</p>
                <p className="font-medium">{viewingVisit.diagnosis || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="font-medium">{viewingVisit.notes || '-'}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
