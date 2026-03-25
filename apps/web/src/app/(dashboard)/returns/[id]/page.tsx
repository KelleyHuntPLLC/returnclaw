import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReturnTimeline } from "@/components/returns/return-timeline";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";

// Mock data for demonstration
const returnData = {
  id: "ret_01",
  item: "Apple AirPods Pro (2nd Gen)",
  retailer: "Amazon",
  retailer_order_id: "114-3941689-8772232",
  amount: 249.0,
  status: "in_transit",
  reason: "Item doesn't match description",
  tracking_number: "1Z999AA10123456784",
  carrier: "UPS",
  label_url: "#",
  created_at: "2026-03-22T10:30:00Z",
  estimated_refund_date: "2026-03-29",
  timeline: [
    { id: "1", status: "initiated", description: "Return initiated via voice command", timestamp: "2026-03-22T10:30:00Z", completed: true },
    { id: "2", status: "approved", description: "Return approved by Amazon", timestamp: "2026-03-22T10:31:00Z", completed: true },
    { id: "3", status: "label_created", description: "UPS shipping label generated", timestamp: "2026-03-22T10:32:00Z", completed: true },
    { id: "4", status: "shipped", description: "Package picked up by UPS", timestamp: "2026-03-23T14:00:00Z", completed: true },
    { id: "5", status: "delivered", description: "Delivered to Amazon return center", timestamp: "", completed: false },
    { id: "6", status: "refunded", description: "Refund of $249.00 processed", timestamp: "", completed: false },
  ],
};

export default function ReturnDetailPage() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500 mb-6">
        <Link href="/returns" className="hover:text-zinc-300 transition-colors">
          Returns
        </Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-zinc-300">{returnData.item}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-zinc-100">{returnData.item}</h1>
            <Badge variant="info">In Transit</Badge>
          </div>
          <p className="text-sm text-zinc-500">
            {returnData.retailer} · Order #{returnData.retailer_order_id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
            Share
          </Button>
          <a href={returnData.label_url}>
            <Button variant="primary" size="sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Label
            </Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <Card variant="glass">
            <h2 className="text-lg font-semibold text-zinc-100 mb-6">Return Timeline</h2>
            <ReturnTimeline events={returnData.timeline} />
          </Card>
        </div>

        {/* Details sidebar */}
        <div className="space-y-4">
          <Card variant="glass">
            <h3 className="text-sm font-medium text-zinc-400 mb-4">Return Details</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-zinc-600">Refund Amount</dt>
                <dd className="text-lg font-bold text-brand-400 font-mono">
                  {formatCurrency(returnData.amount)}
                </dd>
              </div>
              <div className="h-px bg-zinc-800" />
              <div>
                <dt className="text-xs text-zinc-600">Reason</dt>
                <dd className="text-sm text-zinc-300">{returnData.reason}</dd>
              </div>
              <div className="h-px bg-zinc-800" />
              <div>
                <dt className="text-xs text-zinc-600">Carrier</dt>
                <dd className="text-sm text-zinc-300">{returnData.carrier}</dd>
              </div>
              <div className="h-px bg-zinc-800" />
              <div>
                <dt className="text-xs text-zinc-600">Tracking Number</dt>
                <dd className="text-sm text-zinc-300 font-mono">{returnData.tracking_number}</dd>
              </div>
              <div className="h-px bg-zinc-800" />
              <div>
                <dt className="text-xs text-zinc-600">Estimated Refund</dt>
                <dd className="text-sm text-zinc-300">
                  {formatDate(returnData.estimated_refund_date)}
                </dd>
              </div>
              <div className="h-px bg-zinc-800" />
              <div>
                <dt className="text-xs text-zinc-600">Initiated</dt>
                <dd className="text-sm text-zinc-300">
                  {formatDate(returnData.created_at)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card variant="glass" className="text-center">
            <p className="text-xs text-zinc-500 mb-3">Need help with this return?</p>
            <Button variant="voice" size="sm" className="w-full">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
              Ask ReturnClaw
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
