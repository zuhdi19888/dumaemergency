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
import { Plus, Search, Loader2, CheckCircle, Eye, Pill } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Prescription, Visit, Medicine, PrescriptionItem } from '@/types/clinic';

export default function Prescriptions() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewingPrescription, setViewingPrescription] = useState<Prescription | null>(null);
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);

  const [formData, setFormData] = useState({
    visit_id: '',
    notes: '',
    items: [{ medicine_id: '', quantity: 1, dosage: '', frequency: '', duration: '', instructions: '' }],
  });

  useEffect(() => {
    fetchPrescriptions();
    fetchVisits();
    fetchMedicines();
  }, []);

  const fetchPrescriptions = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('prescriptions')
      .select(`
        *,
        visit:visits(
          id,
          visit_date,
          patient:patients(first_name, last_name)
        )
      `)
      .order('prescription_date', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      setPrescriptions(data as any[]);
    }
    setIsLoading(false);
  };

  const fetchVisits = async () => {
    const { data } = await supabase
      .from('visits')
      .select(`
        id,
        visit_date,
        patient:patients(first_name, last_name)
      `)
      .eq('status', 'completed')
      .order('visit_date', { ascending: false });
    if (data) setVisits(data as any[]);
  };

  const fetchMedicines = async () => {
    const { data } = await supabase
      .from('medicines')
      .select('*')
      .order('name');
    if (data) setMedicines(data as Medicine[]);
  };

  const fetchPrescriptionItems = async (prescriptionId: string) => {
    const { data } = await supabase
      .from('prescription_items')
      .select(`
        *,
        medicine:medicines(id, name, unit)
      `)
      .eq('prescription_id', prescriptionId);
    if (data) setPrescriptionItems(data as any[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    // Create prescription
    const { data: prescription, error: prescriptionError } = await supabase
      .from('prescriptions')
      .insert([{
        visit_id: formData.visit_id,
        notes: formData.notes,
        doctor_id: user?.id,
      }])
      .select()
      .single();

    if (prescriptionError) {
      toast({ variant: 'destructive', title: 'Error', description: prescriptionError.message });
      setIsSaving(false);
      return;
    }

    // Create prescription items
    const items = formData.items
      .filter(item => item.medicine_id)
      .map(item => ({
        prescription_id: prescription.id,
        medicine_id: item.medicine_id,
        quantity: item.quantity,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        instructions: item.instructions,
      }));

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('prescription_items')
        .insert(items);

      if (itemsError) {
        toast({ variant: 'destructive', title: 'Error', description: itemsError.message });
        setIsSaving(false);
        return;
      }
    }

    toast({ title: 'Success', description: 'Prescription created successfully' });
    resetForm();
    setIsDialogOpen(false);
    fetchPrescriptions();
    setIsSaving(false);
  };

  const handleDispense = async (prescriptionId: string) => {
    const { error } = await supabase.rpc('dispense_prescription', {
      _prescription_id: prescriptionId,
    });

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Success', description: 'Prescription dispensed and stock updated' });
      fetchPrescriptions();
    }
  };

  const handleViewPrescription = async (prescription: Prescription) => {
    setViewingPrescription(prescription);
    await fetchPrescriptionItems(prescription.id);
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { medicine_id: '', quantity: 1, dosage: '', frequency: '', duration: '', instructions: '' }],
    });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const resetForm = () => {
    setFormData({
      visit_id: '',
      notes: '',
      items: [{ medicine_id: '', quantity: 1, dosage: '', frequency: '', duration: '', instructions: '' }],
    });
  };

  const filteredPrescriptions = prescriptions.filter((p) => {
    const patientName = `${(p as any).visit?.patient?.first_name} ${(p as any).visit?.patient?.last_name}`.toLowerCase();
    return patientName.includes(searchQuery.toLowerCase()) || p.status.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-header">Prescriptions</h1>
          <p className="mt-1 text-muted-foreground">Manage patient prescriptions and dispensing</p>
        </div>
        {hasRole(['admin', 'doctor']) && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Prescription
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Prescription</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="visit_id">Visit *</Label>
                  <Select
                    value={formData.visit_id}
                    onValueChange={(value) => setFormData({ ...formData, visit_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select visit" />
                    </SelectTrigger>
                    <SelectContent>
                      {visits.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.patient?.first_name} {v.patient?.last_name} - {new Date(v.visit_date).toLocaleDateString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Medicines</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add Medicine
                    </Button>
                  </div>
                  {formData.items.map((item, index) => (
                    <div key={index} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Medicine {index + 1}</span>
                        {formData.items.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)}>
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select
                          value={item.medicine_id}
                          onValueChange={(value) => updateItem(index, 'medicine_id', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select medicine" />
                          </SelectTrigger>
                          <SelectContent>
                            {medicines.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name} ({m.stock_quantity} in stock)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          placeholder="Quantity"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        />
                        <Input
                          placeholder="Dosage (e.g., 500mg)"
                          value={item.dosage}
                          onChange={(e) => updateItem(index, 'dosage', e.target.value)}
                        />
                        <Input
                          placeholder="Frequency (e.g., 3x daily)"
                          value={item.frequency}
                          onChange={(e) => updateItem(index, 'frequency', e.target.value)}
                        />
                        <Input
                          placeholder="Duration (e.g., 7 days)"
                          value={item.duration}
                          onChange={(e) => updateItem(index, 'duration', e.target.value)}
                        />
                        <Input
                          placeholder="Instructions"
                          value={item.instructions}
                          onChange={(e) => updateItem(index, 'instructions', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
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
                    Create Prescription
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
          placeholder="Search prescriptions..."
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
              <TableHead>Status</TableHead>
              <TableHead>Dispensed At</TableHead>
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
            ) : filteredPrescriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No prescriptions found
                </TableCell>
              </TableRow>
            ) : (
              filteredPrescriptions.map((prescription) => (
                <TableRow key={prescription.id}>
                  <TableCell className="font-medium">
                    {(prescription as any).visit?.patient?.first_name} {(prescription as any).visit?.patient?.last_name}
                  </TableCell>
                  <TableCell>
                    {new Date(prescription.prescription_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <span className={`status-badge ${
                      prescription.status === 'dispensed' ? 'status-completed' :
                      prescription.status === 'cancelled' ? 'status-cancelled' :
                      'status-pending'
                    }`}>
                      {prescription.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {prescription.dispensed_at
                      ? new Date(prescription.dispensed_at).toLocaleString()
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewPrescription(prescription)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {prescription.status === 'pending' && hasRole(['admin', 'pharmacist']) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDispense(prescription.id)}
                          className="text-success hover:text-success"
                        >
                          <CheckCircle className="h-4 w-4" />
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

      {/* View Prescription Dialog */}
      <Dialog open={!!viewingPrescription} onOpenChange={() => {
        setViewingPrescription(null);
        setPrescriptionItems([]);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Prescription Details</DialogTitle>
          </DialogHeader>
          {viewingPrescription && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-medium">
                    {(viewingPrescription as any).visit?.patient?.first_name} {(viewingPrescription as any).visit?.patient?.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {new Date(viewingPrescription.prescription_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Medicines</p>
                <div className="space-y-2">
                  {prescriptionItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Pill className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{(item as any).medicine?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Qty: {item.quantity} | {item.dosage} | {item.frequency} | {item.duration}
                        </p>
                        {item.instructions && (
                          <p className="text-sm text-muted-foreground">Instructions: {item.instructions}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {viewingPrescription.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="font-medium">{viewingPrescription.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
