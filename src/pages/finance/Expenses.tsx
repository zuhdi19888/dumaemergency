import { useMemo, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { addFinanceEntry, deleteFinanceEntry, getFinanceEntriesByType } from '@/lib/financeStore';
import { useToast } from '@/hooks/use-toast';

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});

export default function FinanceExpenses() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [refreshSeed, setRefreshSeed] = useState(0);

  const expenseEntries = useMemo(() => getFinanceEntriesByType('expense'), [refreshSeed]);
  const totalExpenses = useMemo(
    () => expenseEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [expenseEntries],
  );

  const resetForm = () => {
    setFormData({
      category: '',
      description: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(formData.amount);
    if (!formData.category || amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid input',
        description: 'Category and amount are required.',
      });
      return;
    }

    addFinanceEntry({
      type: 'expense',
      amount,
      category: formData.category,
      description: formData.description,
      date: formData.date,
      notes: formData.notes,
    });
    setRefreshSeed((value) => value + 1);
    setIsDialogOpen(false);
    resetForm();
    toast({ title: 'Success', description: 'Expense record added successfully.' });
  };

  const handleDelete = (id: string) => {
    deleteFinanceEntry(id);
    setRefreshSeed((value) => value + 1);
    toast({ title: 'Deleted', description: 'Expense record removed.' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Expenses"
        subtitle="Track and manage all expense transactions"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <FileText className="mr-2 h-4 w-4" />
              Print Report
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Expense</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateExpense} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      placeholder="e.g., Supplies, Utilities, Rent"
                      value={formData.category}
                      onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount</Label>
                      <Input
                        id="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Save Expense</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card className="hidden print:block">
        <CardContent className="space-y-2 p-5">
          <h2 className="text-xl font-bold">Expenses Report</h2>
          <p className="text-sm text-muted-foreground">Printed at: {new Date().toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">Total Expenses: {currencyFormatter.format(totalExpenses)}</p>
        </CardContent>
      </Card>

      <Card className="stat-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Total Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-destructive">{currencyFormatter.format(totalExpenses)}</p>
        </CardContent>
      </Card>

      <div className="table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="no-print w-[70px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenseEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No expense records
                </TableCell>
              </TableRow>
            ) : (
              expenseEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                  <TableCell>{entry.category}</TableCell>
                  <TableCell>{entry.description || '-'}</TableCell>
                  <TableCell className="text-right font-semibold text-destructive">
                    {currencyFormatter.format(entry.amount)}
                  </TableCell>
                  <TableCell className="no-print text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(entry.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
