import { Command } from "commander";
import ora from "ora";
import { get } from "../utils/api.js";
import {
  printBanner,
  error,
  info,
  printTable,
  statusBadge,
  dim,
  brand,
} from "../utils/display.js";

interface Order {
  id: string;
  retailer: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  order_date: string;
  delivery_date?: string;
  return_eligible: boolean;
  return_deadline?: string;
}

export const ordersCommand = new Command("orders")
  .description("List your detected orders")
  .option("-l, --limit <n>", "Number of orders to show", "10")
  .option("--json", "Output as JSON")
  .option("--returnable", "Only show return-eligible orders")
  .action(async (opts) => {
    printBanner();

    const spinner = ora("Fetching orders...").start();
    const result = await get<{ orders: Order[]; total: number }>(
      `/api/orders?limit=${opts.limit}`
    );

    if (result.error) {
      spinner.fail("Failed to fetch orders");
      error(result.error);
      return;
    }

    spinner.succeed(`Found ${result.data?.total || 0} orders`);
    console.log();

    let orders = result.data?.orders || [];
    if (opts.returnable) {
      orders = orders.filter((o) => o.return_eligible);
    }

    if (opts.json) {
      console.log(JSON.stringify(orders, null, 2));
      return;
    }

    if (orders.length === 0) {
      info("No orders found. Connect your email in Settings to detect orders.");
      return;
    }

    const headers = ["Retailer", "Items", "Total", "Date", "Returnable"];
    const rows = orders.map((o) => [
      o.retailer,
      o.items.map((i) => i.name).join(", ").substring(0, 35) +
        (o.items.map((i) => i.name).join(", ").length > 35 ? "…" : ""),
      `$${o.total.toFixed(2)}`,
      o.order_date,
      o.return_eligible ? brand("✓ Yes") : dim("✗ No"),
    ]);

    printTable(headers, rows, [14, 38, 12, 14, 12]);

    console.log();
    info(`Showing ${orders.length} of ${result.data?.total} orders`);
    if (orders.some((o) => o.return_eligible)) {
      info(
        `Start a return: ${brand('returnclaw return "item name"')}`
      );
    }
    console.log();
  });
