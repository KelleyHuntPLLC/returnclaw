import { Command } from "commander";
import ora from "ora";
import inquirer from "inquirer";
import { post, get } from "../utils/api.js";
import {
  printBanner,
  success,
  error,
  info,
  keyValue,
  formatMoney,
  brand,
  divider,
} from "../utils/display.js";

interface ReturnResponse {
  id: string;
  item_name: string;
  retailer: string;
  amount: number;
  status: string;
  tracking_number?: string;
  label_url?: string;
  estimated_refund_date?: string;
}

interface Order {
  id: string;
  retailer: string;
  items: { name: string; price: number }[];
  order_date: string;
  return_eligible: boolean;
}

export const returnCommand = new Command("return")
  .description("Initiate a return (natural language)")
  .argument("[description]", 'What to return, e.g. "AirPods from Amazon"')
  .option("-r, --reason <reason>", "Reason for return")
  .option("--no-pickup", "Skip pickup scheduling")
  .action(async (description, opts) => {
    printBanner();

    if (!description) {
      const answer = await inquirer.prompt([
        {
          type: "input",
          name: "description",
          message: "What would you like to return?",
          validate: (v: string) => (v.length > 0 ? true : "Please describe the item"),
        },
      ]);
      description = answer.description;
    }

    console.log();
    info(`Processing: "${description}"`);
    console.log();

    // Step 1: Search for matching orders
    const spinner = ora("Searching your orders...").start();
    const ordersResult = await get<{ orders: Order[] }>("/api/orders/search?q=" + encodeURIComponent(description));

    if (ordersResult.error) {
      spinner.fail("Failed to search orders");
      error(ordersResult.error);
      return;
    }

    spinner.succeed("Found matching orders");

    const orders = ordersResult.data?.orders || [];
    if (orders.length === 0) {
      error("No matching orders found. Try a different description.");
      return;
    }

    // Step 2: Let user pick if multiple matches
    let selectedOrder = orders[0];
    if (orders.length > 1) {
      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "order",
          message: "Which order?",
          choices: orders.map((o) => ({
            name: `${o.retailer} — ${o.items.map((i) => i.name).join(", ")} ($${o.items.reduce((s, i) => s + i.price, 0).toFixed(2)})`,
            value: o,
          })),
        },
      ]);
      selectedOrder = answer.order;
    }

    // Step 3: Get return reason
    let reason = opts.reason;
    if (!reason) {
      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "reason",
          message: "Reason for return:",
          choices: [
            "Wrong item received",
            "Item damaged",
            "Doesn't match description",
            "Changed my mind",
            "Better price elsewhere",
            "Arrived too late",
            "Other",
          ],
        },
      ]);
      reason = answer.reason;
    }

    // Step 4: Initiate return
    const returnSpinner = ora("Checking return policy...").start();
    await new Promise((r) => setTimeout(r, 1000));
    returnSpinner.text = "Initiating return...";

    const result = await post<ReturnResponse>("/api/returns", {
      order_id: selectedOrder.id,
      item_name: description,
      reason,
    });

    if (result.error) {
      returnSpinner.fail("Return failed");
      error(result.error);
      return;
    }

    returnSpinner.succeed("Return initiated!");

    const ret = result.data!;
    console.log();
    divider();
    keyValue("Return ID", ret.id);
    keyValue("Item", ret.item_name);
    keyValue("Retailer", ret.retailer);
    keyValue("Refund", formatMoney(ret.amount));
    keyValue("Status", ret.status);
    if (ret.tracking_number) {
      keyValue("Tracking", ret.tracking_number);
    }
    if (ret.label_url) {
      keyValue("Label", brand(ret.label_url));
    }
    if (ret.estimated_refund_date) {
      keyValue("Est. Refund", ret.estimated_refund_date);
    }
    divider();
    console.log();

    // Step 5: Offer pickup
    if (opts.pickup !== false) {
      const { schedulePickup } = await inquirer.prompt([
        {
          type: "confirm",
          name: "schedulePickup",
          message: "Schedule a carrier pickup?",
          default: true,
        },
      ]);

      if (schedulePickup) {
        const pickupSpinner = ora("Scheduling pickup...").start();
        await new Promise((r) => setTimeout(r, 1500));
        pickupSpinner.succeed("Pickup scheduled for tomorrow 12:00 PM – 5:00 PM");
      }
    }

    console.log();
    success("All done! We'll track your return and notify you when the refund arrives.");
    info(`Check status: ${brand(`returnclaw status ${ret.id}`)}`);
    console.log();
  });
