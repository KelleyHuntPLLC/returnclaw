import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, capitalize, formatCurrency } from "@/lib/utils";
import type { BadgeProps } from "@/components/ui/badge";
import Link from "next/link";

interface ReturnCardProps {
  id: string;
  item: string;
  retailer: string;
  amount: number;
  status: string;
  date: string;
  trackingNumber?: string;
}

function getStatusVariant(status: string): BadgeProps["variant"] {
  const map: Record<string, BadgeProps["variant"]> = {
    pending: "warning",
    approved: "success",
    in_transit: "info",
    delivered: "default",
    refunded: "success",
    rejected: "danger",
    processing: "warning",
  };
  return map[status] || "default";
}

export function ReturnCard({
  id,
  item,
  retailer,
  amount,
  status,
  date,
  trackingNumber,
}: ReturnCardProps) {
  return (
    <Link href={`/returns/${id}`}>
      <Card variant="interactive" className="group">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium text-zinc-200 truncate group-hover:text-brand-400 transition-colors">
                {item}
              </h3>
              <Badge variant={getStatusVariant(status)}>
                {capitalize(status)}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500">{retailer}</p>
            {trackingNumber && (
              <p className="text-xs text-zinc-600 mt-1 font-mono">
                {trackingNumber}
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-semibold text-zinc-200 font-mono">
              {formatCurrency(amount)}
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">{formatDate(date)}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
