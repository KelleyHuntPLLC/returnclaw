import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, capitalize } from "@/lib/utils";
import type { BadgeProps } from "@/components/ui/badge";
import Link from "next/link";

const recentReturns = [
  {
    id: "ret_01",
    item: "Apple AirPods Pro (2nd Gen)",
    retailer: "Amazon",
    amount: 249.00,
    status: "in_transit",
    date: "2026-03-22",
  },
  {
    id: "ret_02",
    item: "Nike Air Max 90",
    retailer: "Nike",
    amount: 130.00,
    status: "approved",
    date: "2026-03-20",
  },
  {
    id: "ret_03",
    item: "Sony WH-1000XM5",
    retailer: "Best Buy",
    amount: 348.00,
    status: "refunded",
    date: "2026-03-18",
  },
  {
    id: "ret_04",
    item: 'Samsung 27" Monitor',
    retailer: "Amazon",
    amount: 299.99,
    status: "pending",
    date: "2026-03-24",
  },
  {
    id: "ret_05",
    item: "Patagonia Better Sweater",
    retailer: "Nordstrom",
    amount: 139.00,
    status: "delivered",
    date: "2026-03-15",
  },
];

function getStatusVariant(status: string): BadgeProps["variant"] {
  const map: Record<string, BadgeProps["variant"]> = {
    pending: "warning",
    approved: "success",
    in_transit: "info",
    delivered: "default",
    refunded: "success",
    rejected: "danger",
  };
  return map[status] || "default";
}

export function RecentReturns() {
  return (
    <Card variant="glass" className="overflow-hidden">
      <div className="flex items-center justify-between p-6 pb-0">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">Recent Returns</h3>
          <p className="text-sm text-zinc-500 mt-0.5">Your latest return activity</p>
        </div>
        <Link
          href="/returns"
          className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
        >
          View all →
        </Link>
      </div>
      <div className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Retailer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentReturns.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/returns/${r.id}`} className="font-medium text-zinc-200 hover:text-brand-400 transition-colors">
                    {r.item}
                  </Link>
                </TableCell>
                <TableCell>{r.retailer}</TableCell>
                <TableCell className="font-mono text-zinc-200">
                  ${r.amount.toFixed(2)}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(r.status)}>
                    {capitalize(r.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500">
                  {formatDate(r.date)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
