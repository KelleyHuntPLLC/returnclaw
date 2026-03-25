import { Command } from "commander";
import ora from "ora";
import { get } from "../utils/api.js";
import {
  printBanner,
  error,
  keyValue,
  divider,
  brand,
  dim,
  warn,
} from "../utils/display.js";

interface PolicyResponse {
  retailer: string;
  return_window_days: number;
  free_returns: boolean;
  restocking_fee?: number;
  conditions: string[];
  process: string;
}

export const policyCommand = new Command("policy")
  .description("Look up a retailer's return policy")
  .argument("<retailer>", "Retailer name (e.g., amazon, walmart, target)")
  .option("--json", "Output as JSON")
  .action(async (retailer, opts) => {
    printBanner();

    const spinner = ora(`Looking up ${retailer} return policy...`).start();
    const result = await get<PolicyResponse>(
      `/api/policy/${encodeURIComponent(retailer.toLowerCase())}`
    );

    if (result.error) {
      spinner.fail(`Policy not found for "${retailer}"`);
      error(result.error);
      return;
    }

    spinner.succeed(`Found policy for ${result.data!.retailer}`);
    console.log();

    const policy = result.data!;

    if (opts.json) {
      console.log(JSON.stringify(policy, null, 2));
      return;
    }

    divider();
    keyValue("Retailer", brand(policy.retailer));
    keyValue("Return Window", `${policy.return_window_days} days`);
    keyValue(
      "Free Returns",
      policy.free_returns ? brand("Yes") : warn("No")
    );
    if (policy.restocking_fee) {
      keyValue("Restocking Fee", warn(`${policy.restocking_fee}%`));
    }
    divider();

    if (policy.conditions.length > 0) {
      console.log();
      console.log(dim("  Conditions:"));
      for (const condition of policy.conditions) {
        console.log(`  ${dim("•")} ${condition}`);
      }
    }

    console.log();
    console.log(dim("  Process:"));
    console.log(`  ${policy.process}`);
    console.log();
  });
