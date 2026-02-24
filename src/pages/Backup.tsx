import { useRef, useState } from 'react';
import { Download, Upload, Database, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const TABLES_TO_EXPORT = [
  'profiles',
  'user_roles',
  'patients',
  'medicines',
  'visits',
  'prescriptions',
  'prescription_items',
  'inventory_transactions',
] as const;

const TABLES_TO_CLEAR = [...TABLES_TO_EXPORT].reverse() as typeof TABLES_TO_EXPORT;
const DELETE_ALL_FILTER_UUID = '00000000-0000-0000-0000-000000000000';
const INSERT_CHUNK_SIZE = 500;

type BackupTable = (typeof TABLES_TO_EXPORT)[number];

interface BackupPayload {
  exportedAt?: string;
  version?: number;
  source?: string;
  tables?: Record<string, unknown>;
}

function chunkRows<T>(rows: T[], chunkSize: number): T[][] {
  if (rows.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  return chunks;
}

function assertBackupPayload(payload: unknown): asserts payload is BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('ملف النسخة الاحتياطية غير صالح.');
  }

  if (!('tables' in payload) || typeof (payload as { tables?: unknown }).tables !== 'object' || !(payload as { tables?: unknown }).tables) {
    throw new Error('ملف النسخة الاحتياطية لا يحتوي على tables.');
  }
}

export default function Backup() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastRestoreAt, setLastRestoreAt] = useState<string | null>(null);
  const [lastCounts, setLastCounts] = useState<Record<string, number> | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const results = await Promise.all(
        TABLES_TO_EXPORT.map(async (table) => {
          const { data, error } = await supabase.from(table).select('*');
          if (error) throw new Error(`${table}: ${error.message}`);
          return { table, rows: data ?? [] };
        }),
      );

      const backupPayload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        source: 'dumaemergency-local',
        tables: Object.fromEntries(results.map((result) => [result.table, result.rows])),
      };

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
      const filename = `duma-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      setLastBackupAt(backupPayload.exportedAt);
      setLastCounts(Object.fromEntries(results.map((result) => [result.table, result.rows.length])));
      toast({ title: 'تم إنشاء النسخة', description: `تم تنزيل ${filename}` });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'فشل إنشاء النسخة الاحتياطية',
        description: error instanceof Error ? error.message : 'خطأ غير معروف',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const restoreFromPayload = async (payload: BackupPayload) => {
    const tables = payload.tables ?? {};
    const restoredCounts: Record<string, number> = {};

    for (const table of TABLES_TO_CLEAR) {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq('id', DELETE_ALL_FILTER_UUID);
      if (error) throw new Error(`${table}: ${error.message}`);
    }

    for (const table of TABLES_TO_EXPORT) {
      const rows = Array.isArray(tables[table]) ? (tables[table] as unknown[]) : [];
      restoredCounts[table] = rows.length;
      if (rows.length === 0) continue;

      const chunks = chunkRows(rows, INSERT_CHUNK_SIZE);
      for (const chunk of chunks) {
        const { error } = await (supabase.from(table as never) as any).insert(chunk);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    }

    setLastCounts(restoredCounts);
  };

  const handleRestoreSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const confirmed = window.confirm(
      'سيتم استبدال كل البيانات الحالية بالنسخة الاحتياطية. هل تريد المتابعة؟',
    );
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      const fileText = await file.text();
      const parsed = JSON.parse(fileText) as unknown;
      assertBackupPayload(parsed);

      await restoreFromPayload(parsed);

      setLastRestoreAt(new Date().toISOString());
      toast({
        title: 'تمت الاستعادة بنجاح',
        description: 'تمت استعادة البيانات من ملف النسخة الاحتياطية.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'فشل استعادة النسخة الاحتياطية',
        description: error instanceof Error ? error.message : 'ملف غير صالح أو خطأ أثناء الاستعادة',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  if (!hasRole(['admin', 'doctor'])) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold">تم رفض الوصول</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              فقط المدير أو الطبيب يمكنه إدارة النسخ الاحتياطية.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <input
        ref={restoreInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleRestoreSelected}
      />

      <PageHeader
        title="النسخ الاحتياطي"
        subtitle="إنشاء نسخة كاملة أو استعادة البيانات من ملف JSON"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleExport} disabled={isExporting || isRestoring}>
              {isExporting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري إنشاء النسخة...
                </>
              ) : (
                <>
                  <Download className="ml-2 h-4 w-4" />
                  إنشاء نسخة احتياطية
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => restoreInputRef.current?.click()}
              disabled={isRestoring || isExporting}
            >
              {isRestoring ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الاستعادة...
                </>
              ) : (
                <>
                  <Upload className="ml-2 h-4 w-4" />
                  استعادة نسخة احتياطية
                </>
              )}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">الجداول المشمولة</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{TABLES_TO_EXPORT.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">آخر نسخة احتياطية</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'لا يوجد بعد'}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">آخر استعادة</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {lastRestoreAt ? new Date(lastRestoreAt).toLocaleString() : 'لا يوجد بعد'}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">الحماية</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-success" />
            RLS-protected
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">نطاق النسخة الاحتياطية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TABLES_TO_EXPORT.map((table) => (
              <div key={table} className="flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2 text-sm">
                <Database className="h-4 w-4 text-primary" />
                <span className="font-medium">{table}</span>
                {lastCounts && <span className="ms-auto text-muted-foreground">{lastCounts[table]}</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            ملاحظة: الاستعادة تستبدل البيانات الحالية بالكامل. استخدمها فقط عند الحاجة.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

