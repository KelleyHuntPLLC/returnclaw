"use client";

import { useState } from "react";
import { ReturnCard } from "@/components/returns/return-card";
import { ReturnForm } from "@/components/returns/return-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const returns = [
  { id: "ret_01", item: "Apple AirPods Pro (2nd Gen)", retailer: "Amazon", amount: 249.00, status: "in_transit", date: "2026-03-22", trackingNumber: "1Z999AA10123456784" },
  { id: "ret_02", item: "Nike Air Max 90", retailer: "Nike", amount: 130.00, status: "approved", date: "2026-03-20" },
  { id: "ret_03", item: "Sony WH-1000XM5", retailer: "Best Buy", amount: 348.00, status: "refunded", date: "2026-03-18" },
  { id: "ret_04", item: 'Samsung 27" Monitor', retailer: "Amazon", amount: 299.99, status: "pending", date: "2026-03-24" },
  { id: "ret_05", item: "Patagonia Better Sweater", retailer: "Nordstrom", amount: 139.00, status: "delivered", date: "2026-03-15" },
  { id: "ret_06", item: "Kindle Paperwhite", retailer: "Amazon", amount: 149.99, status: "refunded", date: "2026-03-10" },
  { id: "ret_07", item: "Levi's 501 Jeans", retailer: "Target", amount: 69.50, status: "approved", date: "2026-03-08" },
  { id: "ret_08", item: "Anker USB-C Hub", retailer: "Amazon", amount: 35.99, status: "refunded", date: "2026-03-05" },
];

const filters = ["All", "Pending", "Approved", "In Transit", "Delivered", "Refunded"];

export default function ReturnsPage() {
  const [showForm, setShowForm] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");

  const filteredReturns =
    activeFilter === "All"
      ? returns
      : returns.filter(
          (r) => r.status === activeFilter.toLowerCase().replace(" ", "_")
        );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Returns</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {returns.length} total returns
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Return
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
              activeFilter === filter
                ? "bg-brand-500/10 text-brand-400 border border-brand-500/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-transparent"
            )}
          >
            {filter}
            {filter === "All" && (
              <Badge variant="default" className="ml-2 text-[10px]">
                {returns.length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Returns list */}
      <div className="space-y-3">
        {filteredReturns.map((r) => (
          <ReturnCard key={r.id} {...r} />
        ))}
        {filteredReturns.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">No returns matching this filter.</p>
          </div>
        )}
      </div>

      <ReturnForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
}
