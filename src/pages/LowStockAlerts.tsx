import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Pill, Package, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Medicine } from '@/types/clinic';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';

export default function LowStockAlerts() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [lowStockMedicines, setLowStockMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLowStockMedicines();
  }, []);

  const fetchLowStockMedicines = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('stock_quantity');

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      // Filter medicines where stock is at or below threshold
      const lowStock = (data as Medicine[]).filter(
        (m) => m.stock_quantity <= m.low_stock_threshold
      );
      setLowStockMedicines(lowStock);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Low Stock Alerts"
        subtitle={`Medicines that need to be restocked (${lowStockMedicines.length} items)`}
      />

      {lowStockMedicines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Package className="h-8 w-8 text-success" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">All Stocked Up!</h3>
            <p className="mt-2 text-center text-muted-foreground">
              All medicines are above their low stock thresholds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lowStockMedicines.map((medicine) => {
            const isOutOfStock = medicine.stock_quantity === 0;
            const isCritical = medicine.stock_quantity <= medicine.low_stock_threshold / 2;

            return (
              <Card
                key={medicine.id}
                className={`border-l-4 ${
                  isOutOfStock
                    ? 'border-l-destructive'
                    : isCritical
                    ? 'border-l-warning'
                    : 'border-l-yellow-400'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          isOutOfStock
                            ? 'bg-destructive/10'
                            : isCritical
                            ? 'bg-warning/10'
                            : 'bg-yellow-400/10'
                        }`}
                      >
                        {isOutOfStock ? (
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                        ) : (
                          <Pill
                            className={`h-5 w-5 ${
                              isCritical ? 'text-warning' : 'text-yellow-600'
                            }`}
                          />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{medicine.name}</h3>
                        {medicine.generic_name && (
                          <p className="text-sm text-muted-foreground">
                            {medicine.generic_name}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          Category: {medicine.category || 'Uncategorized'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 p-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Current Stock</p>
                      <p
                        className={`text-2xl font-bold ${
                          isOutOfStock
                            ? 'text-destructive'
                            : isCritical
                            ? 'text-warning'
                            : 'text-yellow-600'
                        }`}
                      >
                        {medicine.stock_quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Threshold</p>
                      <p className="text-lg font-semibold text-foreground">
                        {medicine.low_stock_threshold}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate('/inventory')}
                    >
                      <Package className="mr-2 h-4 w-4" />
                      Add Stock
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
