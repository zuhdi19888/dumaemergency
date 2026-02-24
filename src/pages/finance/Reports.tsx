import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis } from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { getFinanceEntries } from '@/lib/financeStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { printStructuredReport } from '@/lib/printUtils';
import { loadVisitPayments, type VisitPayment } from '@/lib/visitPayments';

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});

type ReportRange = '7' | '30' | '90' | 'all';

const EXPENSE_CHART_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#14b8a6',
  '#eab308',
];

export default function FinanceReports() {
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const [range, setRange] = useState<ReportRange>('all');
  const [visitPayments, setVisitPayments] = useState<VisitPayment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);

  const fetchVisitPayments = async () => {
    setIsLoadingPayments(true);
    const result = await loadVisitPayments(supabase, { completedOnly: true });

    if (result.errorMessage) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: result.errorMessage });
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

  const reportStartDate = useMemo(() => {
    if (range === 'all') return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - Number(range));
    return start;
  }, [range]);

  const filteredEntries = useMemo(() => {
    const entries = getFinanceEntries();
    if (!reportStartDate) return entries;
    return entries.filter((entry) => new Date(entry.date).getTime() >= reportStartDate.getTime());
  }, [reportStartDate]);

  const filteredVisitPayments = useMemo(() => {
    if (!reportStartDate) return visitPayments;
    return visitPayments.filter((payment) => new Date(payment.visit_date).getTime() >= reportStartDate.getTime());
  }, [visitPayments, reportStartDate]);

  const manualIncomeEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.type === 'income'),
    [filteredEntries],
  );

  const expenseEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.type === 'expense'),
    [filteredEntries],
  );

  const totals = useMemo(() => {
    const manualIncome = manualIncomeEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const visitsIncome = filteredVisitPayments.reduce((sum, payment) => sum + (Number(payment.paid_amount) || 0), 0);
    const expenses = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const income = manualIncome + visitsIncome;
    return {
      manualIncome,
      visitsIncome,
      income,
      expenses,
      balance: income - expenses,
    };
  }, [manualIncomeEntries, filteredVisitPayments, expenseEntries]);

  const rangeLabel = useMemo(() => {
    if (range === 'all') return t('كل الفترات', 'All periods');
    if (range === '7') return t('آخر 7 أيام', 'Last 7 days');
    if (range === '30') return t('آخر 30 يوم', 'Last 30 days');
    return t('آخر 90 يوم', 'Last 90 days');
  }, [range, t]);

  const dateLocale = language === 'ar' ? 'ar-PS' : 'en-US';

  const incomeVsExpenseChartConfig: ChartConfig = {
    income: {
      label: t('الدخل', 'Income'),
      color: '#14b8a6',
    },
    expenses: {
      label: t('المصروفات', 'Expenses'),
      color: '#ef4444',
    },
  };

  const incomeVsExpenseChartData = useMemo(() => {
    const byDay = new Map<string, { period: string; income: number; expenses: number; dateValue: number }>();

    const addPoint = (dateInput: string | Date, key: 'income' | 'expenses', amount: number) => {
      const numericAmount = Number(amount) || 0;
      if (numericAmount <= 0) return;

      const date = new Date(dateInput);
      if (Number.isNaN(date.getTime())) return;

      const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const periodLabel = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
      const existing = byDay.get(dayKey) ?? {
        period: periodLabel,
        income: 0,
        expenses: 0,
        dateValue: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
      };

      existing[key] += numericAmount;
      byDay.set(dayKey, existing);
    };

    for (const entry of manualIncomeEntries) {
      addPoint(entry.date, 'income', entry.amount);
    }

    for (const payment of filteredVisitPayments) {
      addPoint(payment.visit_date, 'income', Number(payment.paid_amount) || 0);
    }

    for (const entry of expenseEntries) {
      addPoint(entry.date, 'expenses', entry.amount);
    }

    const data = Array.from(byDay.values())
      .sort((a, b) => a.dateValue - b.dateValue)
      .map(({ dateValue: _dateValue, ...item }) => item);

    if (data.length > 0) return data;

    const today = new Date();
    return [
      {
        period: today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }),
        income: 0,
        expenses: 0,
      },
    ];
  }, [manualIncomeEntries, filteredVisitPayments, expenseEntries]);

  const expenseCategoryData = useMemo(() => {
    const byCategory = new Map<string, number>();

    for (const entry of expenseEntries) {
      const category = entry.category?.trim() || t('غير مصنف', 'Uncategorized');
      byCategory.set(category, (byCategory.get(category) ?? 0) + entry.amount);
    }

    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, value], index) => ({
        category,
        value,
        fill: EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length],
      }));
  }, [expenseEntries, t]);

  const expenseBreakdownChartConfig = useMemo(
    () =>
      expenseCategoryData.reduce<ChartConfig>((acc, item) => {
        acc[item.category] = { label: item.category, color: item.fill };
        return acc;
      }, {}),
    [expenseCategoryData],
  );

  const visitPaymentPrintRows = useMemo(
    () =>
      filteredVisitPayments.map((payment, index) => ({
        label: `${t('دفعة', 'Payment')} ${index + 1}`,
        value: [
          `${t('التاريخ', 'Date')}: ${new Date(payment.visit_date).toLocaleString(dateLocale)}`,
          `${t('المريض', 'Patient')}: ${`${payment.patient?.first_name ?? ''} ${payment.patient?.last_name ?? ''}`.trim() || '-'}`,
          `${t('المصدر', 'Source')}: ${t('دفع زيارة مريض', 'Patient visit payment')}`,
          `${t('الطبيب', 'Doctor')}: ${payment.collector?.full_name || payment.collector?.email || '-'}`,
          `${t('المبلغ', 'Amount')}: ${currencyFormatter.format(Number(payment.paid_amount) || 0)}`,
        ].join(' | '),
      })),
    [filteredVisitPayments, dateLocale, t],
  );

  const manualIncomePrintRows = useMemo(
    () =>
      manualIncomeEntries.map((entry, index) => ({
        label: `${t('إدخال دخل', 'Income entry')} ${index + 1}`,
        value: [
          `${t('التاريخ', 'Date')}: ${new Date(entry.date).toLocaleString(dateLocale)}`,
          `${t('الفئة', 'Category')}: ${entry.category || '-'}`,
          `${t('الوصف', 'Description')}: ${entry.description || '-'}`,
          `${t('ملاحظات', 'Notes')}: ${entry.notes || '-'}`,
          `${t('المبلغ', 'Amount')}: ${currencyFormatter.format(entry.amount)}`,
        ].join(' | '),
      })),
    [manualIncomeEntries, dateLocale, t],
  );

  const expensePrintRows = useMemo(
    () =>
      expenseEntries.map((entry, index) => ({
        label: `${t('مصروف', 'Expense')} ${index + 1}`,
        value: [
          `${t('التاريخ', 'Date')}: ${new Date(entry.date).toLocaleString(dateLocale)}`,
          `${t('الفئة', 'Category')}: ${entry.category || '-'}`,
          `${t('الوصف', 'Description')}: ${entry.description || '-'}`,
          `${t('ملاحظات', 'Notes')}: ${entry.notes || '-'}`,
          `${t('المبلغ', 'Amount')}: ${currencyFormatter.format(entry.amount)}`,
        ].join(' | '),
      })),
    [expenseEntries, dateLocale, t],
  );

  const handlePrintDetailedFinanceReport = () => {
    printStructuredReport({
      reportTitle: t('تقرير مالي تفصيلي', 'Detailed Financial Report'),
      reportSubTitle: `${t('الفترة', 'Range')}: ${rangeLabel}`,
      generatedAt: new Date().toLocaleString(dateLocale),
      rows: [
        { label: t('عدد مدفوعات الزيارات', 'Visit payments count'), value: String(filteredVisitPayments.length) },
        { label: t('إجمالي مدفوعات الزيارات', 'Total visit payments'), value: currencyFormatter.format(totals.visitsIncome) },
        { label: t('عدد إدخالات الدخل اليدوي', 'Manual income entries count'), value: String(manualIncomeEntries.length) },
        { label: t('إجمالي الدخل اليدوي', 'Total manual income'), value: currencyFormatter.format(totals.manualIncome) },
        { label: t('عدد المصروفات', 'Expenses count'), value: String(expenseEntries.length) },
        { label: t('إجمالي المصروفات', 'Total expenses'), value: currencyFormatter.format(totals.expenses) },
        { label: t('الصافي', 'Net'), value: currencyFormatter.format(totals.balance) },
      ],
      sections: [
        {
          title: t('تفاصيل مدفوعات الزيارات', 'Visit payment details'),
          rows:
            visitPaymentPrintRows.length > 0
              ? visitPaymentPrintRows
              : [{ label: '-', value: t('لا توجد مدفوعات زيارات ضمن الفترة المحددة', 'No visit payments in the selected period') }],
        },
        {
          title: t('تفاصيل الدخل اليدوي', 'Manual income details'),
          rows:
            manualIncomePrintRows.length > 0
              ? manualIncomePrintRows
              : [{ label: '-', value: t('لا توجد إدخالات دخل يدوي ضمن الفترة المحددة', 'No manual income entries in the selected period') }],
        },
        {
          title: t('تفاصيل المصروفات', 'Expense details'),
          rows:
            expensePrintRows.length > 0
              ? expensePrintRows
              : [{ label: '-', value: t('لا توجد مصروفات ضمن الفترة المحددة', 'No expenses in the selected period') }],
        },
      ],
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('التقارير المالية', 'Financial Reports')}
        subtitle={t('تقرير تفصيلي للمدفوعات والمصروفات', 'Detailed report of payments and expenses')}
        action={(
          <div className="no-print flex items-center gap-2">
            <Select value={range} onValueChange={(value: ReportRange) => setRange(value)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder={t('اختر الفترة', 'Select range')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('آخر 7 أيام', 'Last 7 days')}</SelectItem>
                <SelectItem value="30">{t('آخر 30 يوم', 'Last 30 days')}</SelectItem>
                <SelectItem value="90">{t('آخر 90 يوم', 'Last 90 days')}</SelectItem>
                <SelectItem value="all">{t('كل الفترات', 'All periods')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handlePrintDetailedFinanceReport}>
              <FileText className="ml-2 h-4 w-4" />
              {t('طباعة التقرير', 'Print Report')}
            </Button>
          </div>
        )}
      />
      <Card className="hidden print:block">
        <CardContent className="space-y-2 p-5">
          <h2 className="text-xl font-bold">{t('تقرير مالي', 'Financial Report')}</h2>
          <p className="text-sm text-muted-foreground">{t('الفترة', 'Range')}: {rangeLabel}</p>
          <p className="text-sm text-muted-foreground">
            {t('تاريخ الطباعة', 'Printed at')}: {new Date().toLocaleString(dateLocale)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {t('مدفوعات الزيارات', 'Visit Payments')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{currencyFormatter.format(totals.visitsIncome)}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t('الدخل اليدوي', 'Manual Income')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{currencyFormatter.format(totals.manualIncome)}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t('إجمالي الدخل', 'Total Income')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{currencyFormatter.format(totals.income)}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t('إجمالي المصروفات', 'Total Expenses')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{currencyFormatter.format(totals.expenses)}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t('الصافي', 'Net')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totals.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
              {currencyFormatter.format(totals.balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {t('الدخل مقابل المصروفات', 'Income vs Expenses')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={incomeVsExpenseChartConfig} className="h-[300px] w-full">
              <BarChart data={incomeVsExpenseChartData} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip
                  cursor={false}
                  content={(
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            {name === 'income' ? t('الدخل', 'Income') : t('المصروفات', 'Expenses')}
                          </span>
                          <span className="font-medium text-foreground">
                            {currencyFormatter.format(Number(value) || 0)}
                          </span>
                        </div>
                      )}
                    />
                  )}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="income" fill="var(--color-income)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {t('توزيع المصروفات حسب الفئة', 'Category Breakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenseCategoryData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                {t('لا توجد فئات مصروفات ضمن الفترة المحددة', 'No expense categories in selected period')}
              </div>
            ) : (
              <ChartContainer config={expenseBreakdownChartConfig} className="h-[300px] w-full">
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={(
                      <ChartTooltipContent
                        nameKey="category"
                        formatter={(value, name) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">{String(name)}</span>
                            <span className="font-medium text-foreground">
                              {currencyFormatter.format(Number(value) || 0)}
                            </span>
                          </div>
                        )}
                      />
                    )}
                  />
                  <Pie
                    data={expenseCategoryData}
                    dataKey="value"
                    nameKey="category"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {expenseCategoryData.map((entry) => (
                      <Cell key={entry.category} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="category" />} verticalAlign="bottom" />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('تفاصيل مدفوعات المرضى (من الزيارات)', 'Patient Payments Details (Visits)')}
          </CardTitle>
        </CardHeader>
        <CardContent className="table-container p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date')}</TableHead>
                <TableHead>{t('المريض', 'Patient')}</TableHead>
                <TableHead>{t('المصدر', 'Source')}</TableHead>
                <TableHead>{t('الطبيب', 'Doctor')}</TableHead>
                <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingPayments ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {t('جاري تحميل مدفوعات الزيارات...', 'Loading visit payments...')}
                  </TableCell>
                </TableRow>
              ) : filteredVisitPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {t('لا توجد مدفوعات زيارات ضمن الفترة المحددة', 'No visit payments in the selected period')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredVisitPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{new Date(payment.visit_date).toLocaleDateString(dateLocale)}</TableCell>
                    <TableCell>
                      {payment.patient?.first_name} {payment.patient?.last_name}
                    </TableCell>
                    <TableCell>{t('دفع زيارة مريض', 'Patient visit payment')}</TableCell>
                    <TableCell>{payment.collector?.full_name || payment.collector?.email || '-'}</TableCell>
                    <TableCell className="text-right font-semibold text-success">
                      {currencyFormatter.format(Number(payment.paid_amount) || 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t('تفاصيل الدخل اليدوي', 'Manual Income Details')}</CardTitle>
        </CardHeader>
        <CardContent className="table-container p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date')}</TableHead>
                <TableHead>{t('الفئة', 'Category')}</TableHead>
                <TableHead>{t('الوصف', 'Description')}</TableHead>
                <TableHead>{t('ملاحظات', 'Notes')}</TableHead>
                <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manualIncomeEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {t('لا توجد إدخالات دخل يدوي ضمن الفترة المحددة', 'No manual income entries in the selected period')}
                  </TableCell>
                </TableRow>
              ) : (
                manualIncomeEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{new Date(entry.date).toLocaleDateString(dateLocale)}</TableCell>
                    <TableCell>{entry.category}</TableCell>
                    <TableCell>{entry.description || '-'}</TableCell>
                    <TableCell>{entry.notes || '-'}</TableCell>
                    <TableCell className="text-right font-semibold text-success">
                      {currencyFormatter.format(entry.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t('تفاصيل المصروفات', 'Expense Details')}</CardTitle>
        </CardHeader>
        <CardContent className="table-container p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date')}</TableHead>
                <TableHead>{t('الفئة', 'Category')}</TableHead>
                <TableHead>{t('الوصف', 'Description')}</TableHead>
                <TableHead>{t('ملاحظات', 'Notes')}</TableHead>
                <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenseEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {t('لا توجد مصروفات ضمن الفترة المحددة', 'No expenses in the selected period')}
                  </TableCell>
                </TableRow>
              ) : (
                expenseEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{new Date(entry.date).toLocaleDateString(dateLocale)}</TableCell>
                    <TableCell>{entry.category}</TableCell>
                    <TableCell>{entry.description || '-'}</TableCell>
                    <TableCell>{entry.notes || '-'}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">
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

