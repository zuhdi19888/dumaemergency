import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowRightLeft, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/layout/PageHeader';
import { getFinanceEntries, getFinanceTotals } from '@/lib/financeStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { loadVisitPayments, type VisitPayment } from '@/lib/visitPayments';

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});

type TransactionRow = {
  id: string;
  date: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  collector: string;
  amount: number;
  source: 'visits' | 'manual';
};

export default function FinanceBalance() {
  const { toast } = useToast();
  const entries = useMemo(() => getFinanceEntries(), []);
  const manualTotals = useMemo(() => getFinanceTotals(), []);
  const [visitPayments, setVisitPayments] = useState<VisitPayment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);

  const fetchVisitPayments = async () => {
    setIsLoadingPayments(true);
    const result = await loadVisitPayments(supabase, { completedOnly: true });
    if (result.errorMessage) {
      toast({ variant: 'destructive', title: 'Error', description: result.errorMessage });
      setVisitPayments([]);
      setIsLoadingPayments(false);
      return;
    }

    setVisitPayments(result.payments);
    setIsLoadingPayments(false);
  };

  useEffect(() => {
    void fetchVisitPayments();
  }, []);

  const visitsIncome = useMemo(
    () => visitPayments.reduce((sum, payment) => sum + (Number(payment.paid_amount) || 0), 0),
    [visitPayments],
  );

  const totals = useMemo(() => {
    const totalIncome = manualTotals.totalIncome + visitsIncome;
    return {
      totalIncome,
      totalExpenses: manualTotals.totalExpenses,
      balance: totalIncome - manualTotals.totalExpenses,
    };
  }, [manualTotals.totalExpenses, manualTotals.totalIncome, visitsIncome]);

  const mergedTransactions = useMemo(() => {
    const manualRows: TransactionRow[] = entries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      type: entry.type,
      category: entry.category,
      description: entry.description || '-',
      collector: '-',
      amount: entry.amount,
      source: 'manual',
    }));

    const visitRows: TransactionRow[] = visitPayments.map((payment) => ({
      id: `visit-${payment.id}`,
      date: payment.visit_date,
      type: 'income',
      category: 'Patient Visit',
      description: `${payment.patient?.first_name ?? ''} ${payment.patient?.last_name ?? ''}`.trim() || '-',
      collector: payment.collector?.full_name || payment.collector?.email || '-',
      amount: Number(payment.paid_amount) || 0,
      source: 'visits',
    }));

    return [...manualRows, ...visitRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [entries, visitPayments]);

  const recentEntries = useMemo(() => mergedTransactions.slice(0, 10), [mergedTransactions]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Balance"
        subtitle="Financial overview and current balance"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <FileText className="mr-2 h-4 w-4" />
              Print Report
            </Button>
            <Link to="/finance/income">
              <Button variant="outline">Add Income</Button>
            </Link>
            <Link to="/finance/expenses">
              <Button>Add Expense</Button>
            </Link>
          </div>
        }
      />

      <Card className="hidden print:block">
        <CardContent className="space-y-2 p-5">
          <h2 className="text-xl font-bold">Balance Report</h2>
          <p className="text-sm text-muted-foreground">Printed at: {new Date().toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">Current Balance: {currencyFormatter.format(totals.balance)}</p>
          <p className="text-sm text-muted-foreground">Total Income: {currencyFormatter.format(totals.totalIncome)}</p>
          <p className="text-sm text-muted-foreground">Total Expenses: {currencyFormatter.format(totals.totalExpenses)}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Current Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${totals.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
              {currencyFormatter.format(totals.balance)}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Income</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-bold text-success">{currencyFormatter.format(totals.totalIncome)}</p>
            <TrendingUp className="h-5 w-5 text-success" />
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-bold text-destructive">{currencyFormatter.format(totals.totalExpenses)}</p>
            <TrendingDown className="h-5 w-5 text-destructive" />
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-bold">{mergedTransactions.length}</p>
            <ArrowRightLeft className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Transactions</CardTitle>
          <span className="text-xs text-muted-foreground">Manual records + visit payments</span>
        </CardHeader>
        <CardContent className="table-container p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingPayments && recentEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Loading visit payments...
                  </TableCell>
                </TableRow>
              ) : recentEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No transactions yet
                  </TableCell>
                </TableRow>
              ) : (
                recentEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span
                        className={`status-badge capitalize ${
                          entry.type === 'income' ? 'status-completed' : 'status-cancelled'
                        }`}
                      >
                        {entry.type}
                      </span>
                    </TableCell>
                    <TableCell>{entry.source === 'visits' ? 'Visit' : 'Manual'}</TableCell>
                    <TableCell>{entry.category}</TableCell>
                    <TableCell>{entry.description || '-'}</TableCell>
                    <TableCell>{entry.collector}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        entry.type === 'income' ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {entry.type === 'income' ? '+' : '-'}
                      {currencyFormatter.format(entry.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
