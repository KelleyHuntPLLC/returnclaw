import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

interface OrderCardProps {
  id: string;
  retailer: string;
  orderId: string;
  items: OrderItem[];
  total: number;
  orderDate: string;
  deliveryDate?: string;
  returnEligible: boolean;
  returnDeadline?: string;
}

export function OrderCard({
  retailer,
  orderId,
  items,
  total,
  orderDate,
  deliveryDate,
  returnEligible,
  returnDeadline,
}: OrderCardProps) {
  return (
    <Card variant="glass">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-zinc-200">{retailer}</h3>
            {returnEligible ? (
              <Badge variant="success">Return Eligible</Badge>
            ) : (
              <Badge variant="default">Window Closed</Badge>
            )}
          </div>
          <p className="text-xs text-zinc-600 font-mono">#{orderId}</p>
        </div>
        <p className="text-sm font-semibold text-zinc-200 font-mono">
          {formatCurrency(total)}
        </p>
      </div>

      {/* Items */}
      <div className="space-y-2 mb-4">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">
              {item.name}
              {item.quantity > 1 && (
                <span className="text-zinc-600"> ×{item.quantity}</span>
              )}
            </span>
            <span className="text-zinc-500 font-mono text-xs">
              {formatCurrency(item.price)}
            </span>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
        <div className="flex items-center gap-4 text-xs text-zinc-600">
          <span>Ordered {formatDate(orderDate)}</span>
          {deliveryDate && <span>Delivered {formatDate(deliveryDate)}</span>}
          {returnDeadline && (
            <span className="text-yellow-500">
              Return by {formatDate(returnDeadline)}
            </span>
          )}
        </div>
        {returnEligible && (
          <Button variant="ghost" size="sm">
            Return →
          </Button>
        )}
      </div>
    </Card>
  );
}
