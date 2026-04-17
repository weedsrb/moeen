import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Package } from "lucide-react";
import type { Product } from "@/types/product";
import { getAvailableQuantity, formatPrice } from "@/lib/utils/inventory";

interface InventoryAlertsProps {
  outOfStock: Product[];
  lowStock: Product[];
}

export function InventoryAlerts({
  outOfStock,
  lowStock,
}: InventoryAlertsProps) {
  const hasAlerts = outOfStock.length > 0 || lowStock.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="h-5 w-5" />
          Inventory Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasAlerts ? (
          <div className="flex items-center gap-2 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            All products are well stocked
          </div>
        ) : (
          <div className="space-y-4">
            {outOfStock.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-500 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Out of Stock ({outOfStock.length})
                </p>
                <div className="space-y-1">
                  {outOfStock.map((p) => (
                    <Link
                      key={p.id}
                      href={`/inventory/${p.id}`}
                      className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-sm"
                    >
                      <span>{p.name}</span>
                      <span className="font-mono text-red-500">
                        {getAvailableQuantity(p)} available
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {lowStock.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-500 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Low Stock ({lowStock.length})
                </p>
                <div className="space-y-1">
                  {lowStock.map((p) => (
                    <Link
                      key={p.id}
                      href={`/inventory/${p.id}`}
                      className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-sm"
                    >
                      <span>{p.name}</span>
                      <span className="font-mono text-amber-500">
                        {getAvailableQuantity(p)} available
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
