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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Edit, Trash2, Loader2, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Medicine } from '@/types/clinic';

export default function Inventory() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [stockNotes, setStockNotes] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    generic_name: '',
    description: '',
    category: '',
    unit: 'tablet',
    stock_quantity: 0,
    low_stock_threshold: 10,
    unit_price: 0,
    expiry_date: '',
  });

  useEffect(() => {
    fetchMedicines();
  }, []);

  const fetchMedicines = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('name');

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      setMedicines(data as Medicine[]);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    let error;
    if (editingMedicine) {
      const { error: updateError } = await supabase
        .from('medicines')
        .update(formData)
        .eq('id', editingMedicine.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('medicines')
        .insert([formData]);
      error = insertError;
    }

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Success', description: `Medicine ${editingMedicine ? 'updated' : 'created'} successfully` });
      resetForm();
      setIsDialogOpen(false);
      fetchMedicines();
    }
    setIsSaving(false);
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedicine) return;
    setIsSaving(true);

    const { error } = await supabase.rpc('add_stock', {
      _medicine_id: selectedMedicine.id,
      _quantity: stockQuantity,
      _notes: stockNotes || null,
    });

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Success', description: 'Stock added successfully' });
      setIsStockDialogOpen(false);
      setSelectedMedicine(null);
      setStockQuantity(0);
      setStockNotes('');
      fetchMedicines();
    }
    setIsSaving(false);
  };

  const handleEdit = (medicine: Medicine) => {
    setEditingMedicine(medicine);
    setFormData({
      name: medicine.name,
      generic_name: medicine.generic_name || '',
      description: medicine.description || '',
      category: medicine.category || '',
      unit: medicine.unit,
      stock_quantity: medicine.stock_quantity,
      low_stock_threshold: medicine.low_stock_threshold,
      unit_price: medicine.unit_price || 0,
      expiry_date: medicine.expiry_date || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this medicine?')) return;

    const { error } = await supabase.from('medicines').delete().eq('id', id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Success', description: 'Medicine deleted successfully' });
      fetchMedicines();
    }
  };

  const resetForm = () => {
    setEditingMedicine(null);
    setFormData({
      name: '',
      generic_name: '',
      description: '',
      category: '',
      unit: 'tablet',
      stock_quantity: 0,
      low_stock_threshold: 10,
      unit_price: 0,
      expiry_date: '',
    });
  };

  const filteredMedicines = medicines.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.generic_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-header">Inventory</h1>
          <p className="mt-1 text-muted-foreground">Manage medicine inventory and stock</p>
        </div>
        {hasRole(['admin', 'pharmacist']) && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Medicine
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingMedicine ? 'Edit Medicine' : 'New Medicine'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="generic_name">Generic Name</Label>
                  <Input
                    id="generic_name"
                    value={formData.generic_name}
                    onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="e.g., Antibiotics"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="e.g., tablet, ml, mg"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="stock_quantity">Initial Stock</Label>
                    <Input
                      id="stock_quantity"
                      type="number"
                      min="0"
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="low_stock_threshold">Low Stock Threshold</Label>
                    <Input
                      id="low_stock_threshold"
                      type="number"
                      min="0"
                      value={formData.low_stock_threshold}
                      onChange={(e) => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="unit_price">Unit Price</Label>
                    <Input
                      id="unit_price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.unit_price}
                      onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiry_date">Expiry Date</Label>
                    <Input
                      id="expiry_date"
                      type="date"
                      value={formData.expiry_date}
                      onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingMedicine ? 'Update' : 'Create'}
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
          placeholder="Search medicines..."
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
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredMedicines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No medicines found
                </TableCell>
              </TableRow>
            ) : (
              filteredMedicines.map((medicine) => (
                <TableRow key={medicine.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{medicine.name}</p>
                      {medicine.generic_name && (
                        <p className="text-sm text-muted-foreground">{medicine.generic_name}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{medicine.category || '-'}</TableCell>
                  <TableCell>{medicine.unit}</TableCell>
                  <TableCell>
                    <span className={medicine.stock_quantity <= medicine.low_stock_threshold ? 'low-stock rounded px-2 py-1' : ''}>
                      {medicine.stock_quantity}
                    </span>
                  </TableCell>
                  <TableCell>${medicine.unit_price?.toFixed(2) || '0.00'}</TableCell>
                  <TableCell>
                    {medicine.expiry_date
                      ? new Date(medicine.expiry_date).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {hasRole(['admin', 'pharmacist']) && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedMedicine(medicine);
                              setIsStockDialogOpen(true);
                            }}
                            title="Add Stock"
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(medicine)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(medicine.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Stock Dialog */}
      <Dialog open={isStockDialogOpen} onOpenChange={(open) => {
        setIsStockDialogOpen(open);
        if (!open) {
          setSelectedMedicine(null);
          setStockQuantity(0);
          setStockNotes('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Stock</DialogTitle>
          </DialogHeader>
          {selectedMedicine && (
            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Medicine</p>
                <p className="font-medium">{selectedMedicine.name}</p>
                <p className="text-sm text-muted-foreground">Current Stock: {selectedMedicine.stock_quantity}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock_qty">Quantity to Add *</Label>
                <Input
                  id="stock_qty"
                  type="number"
                  min="1"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(parseInt(e.target.value) || 0)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock_notes">Notes</Label>
                <Textarea
                  id="stock_notes"
                  value={stockNotes}
                  onChange={(e) => setStockNotes(e.target.value)}
                  placeholder="e.g., Purchase order #123"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsStockDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || stockQuantity <= 0}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Stock
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
