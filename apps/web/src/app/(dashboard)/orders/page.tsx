import { OrderCard } from "@/components/orders/order-card";
import { Input } from "@/components/ui/input";

const orders = [
  {
    id: "ord_01",
    retailer: "Amazon",
    orderId: "114-3941689-8772232",
    items: [
      { name: "Apple AirPods Pro (2nd Gen)", price: 249.00, quantity: 1 },
      { name: "USB-C to Lightning Cable", price: 19.99, quantity: 2 },
    ],
    total: 288.98,
    orderDate: "2026-03-15",
    deliveryDate: "2026-03-18",
    returnEligible: true,
    returnDeadline: "2026-04-17",
  },
  {
    id: "ord_02",
    retailer: "Nike",
    orderId: "C12345678",
    items: [{ name: "Air Max 90", price: 130.00, quantity: 1 }],
    total: 130.00,
    orderDate: "2026-03-10",
    deliveryDate: "2026-03-14",
    returnEligible: true,
    returnDeadline: "2026-04-13",
  },
  {
    id: "ord_03",
    retailer: "Best Buy",
    orderId: "BBY01-806841033",
    items: [
      { name: "Sony WH-1000XM5", price: 348.00, quantity: 1 },
    ],
    total: 348.00,
    orderDate: "2026-03-08",
    deliveryDate: "2026-03-11",
    returnEligible: true,
    returnDeadline: "2026-03-26",
  },
  {
    id: "ord_04",
    retailer: "Amazon",
    orderId: "114-7892145-3389012",
    items: [
      { name: 'Samsung 27" Monitor', price: 299.99, quantity: 1 },
      { name: "Monitor Arm Mount", price: 34.99, quantity: 1 },
    ],
    total: 334.98,
    orderDate: "2026-03-20",
    deliveryDate: "2026-03-23",
    returnEligible: true,
    returnDeadline: "2026-04-22",
  },
  {
    id: "ord_05",
    retailer: "Nordstrom",
    orderId: "N4589012345",
    items: [
      { name: "Patagonia Better Sweater", price: 139.00, quantity: 1 },
      { name: "Smartwool Hiking Socks", price: 24.95, quantity: 2 },
    ],
    total: 188.90,
    orderDate: "2026-03-01",
    deliveryDate: "2026-03-05",
    returnEligible: false,
  },
  {
    id: "ord_06",
    retailer: "Target",
    orderId: "TGT-78901234",
    items: [
      { name: "Levi's 501 Jeans", price: 69.50, quantity: 1 },
      { name: "Champion Hoodie", price: 45.00, quantity: 1 },
    ],
    total: 114.50,
    orderDate: "2026-02-28",
    deliveryDate: "2026-03-03",
    returnEligible: false,
  },
];

export default function OrdersPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Orders</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {orders.length} orders detected from your email
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder="Search orders..."
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          }
        />
      </div>

      {/* Orders list */}
      <div className="space-y-4">
        {orders.map((order) => (
          <OrderCard key={order.id} {...order} />
        ))}
      </div>

      {/* Email sync status */}
      <div className="mt-8 text-center p-6 glass-card rounded-xl">
        <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
          <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
          Email synced 5 minutes ago
        </div>
        <p className="text-xs text-zinc-600 mt-1">
          Connected to aisha@kelleyhunt.law via Gmail
        </p>
      </div>
    </div>
  );
}
