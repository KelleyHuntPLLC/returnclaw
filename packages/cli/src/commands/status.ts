import { Command } from "commander";
import ora from "ora";
import { get } from "../utils/api.js";
import {
  printBanner,
  success,
  error,
  keyValue,
  formatMoney,
  statusBadge,
  divider,
  brand,
  dim,
} from "../utils/display.js";

interface ReturnDetail {
  id: string;
  item_name: string;
  retailer: string;
  amount: number;
  status: string;
  reason: string;
  tracking_number?: string;
  carrier?: string;
  label_url?: string;
  created_at: string;
  estimated_refund_date?: string;
  timeline: {
    status: string;
    description: string;
    timestamp: string;
  }[];
}

export const statusCommand = new Command("status")
  .description("Check return status")
  .argument("<return-id>", "Return ID (e.g., ret_01)")
  .option("--json", "Output as JSON")
  .action(async (returnId, opts) => {
    printBanner();

    const spinner = ora(`Fetching return ${returnId}...`).start();
    const result = await get<ReturnDetail>(`/api/returns/${returnId}`);

    if (result.error) {
      spinner.fail("Failed to fetch return");
      error(result.error);
      return;
    }

    spinner.succeed("Return found");
    console.log();

    const ret = result.data!;

    if (opts.json) {
      console.log(JSON.stringify(ret, null, 2));
      return;
    }

    // Return details
    divider();
    keyValue("Return ID", ret.id);
    keyValue("Item", ret.item_name);
    keyValue("Retailer", ret.retailer);
    keyValue("Amount", formatMoney(ret.amount));
    keyValue("Status", statusBadge(ret.status));
    keyValue("Reason", ret.reason);
    if (ret.carrier) keyValue("Carrier", ret.carrier);
    if (ret.tracking_number) keyValue("Tracking", ret.tracking_number);
    if (ret.estimated_refund_date) keyValue("Est. Refund", ret.estimated_refund_date);
    keyValue("Initiated", ret.created_at);
    divider();

    // Timeline
    if (ret.timeline && ret.timeline.length > 0) {
      console.log();
      console.log(brand("  Timeline:"));
      console.log();

      for (const event of ret.timeline) {
        const timestamp = event.timestamp
          ? dim(new Date(event.timestamp).toLocaleDateString())
          : dim("pending");
        const marker = event.timestamp ? brand("●") : dim("○");
        console.log(`  ${marker} ${event.description} ${timestamp}`);
      }
    }

    console.log();
  });
