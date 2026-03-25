import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { setConfig } from "../utils/auth.js";
import { printBanner, success, info, error, dim, brand } from "../utils/display.js";
import { get } from "../utils/api.js";

export const initCommand = new Command("init")
  .description("Initialize ReturnClaw configuration")
  .option("--api-key <key>", "API key (skip interactive prompt)")
  .option("--api-url <url>", "Custom API URL")
  .action(async (opts) => {
    printBanner();
    console.log("  Let's set up ReturnClaw.\n");

    let apiKey = opts.apiKey;
    let apiUrl = opts.apiUrl;

    if (!apiKey) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "apiKey",
          message: "Enter your API key:",
          validate: (v: string) =>
            v.startsWith("rc_") ? true : "API key should start with rc_",
        },
        {
          type: "input",
          name: "apiUrl",
          message: "API URL (press Enter for default):",
          default: "http://localhost:3001",
        },
        {
          type: "list",
          name: "carrier",
          message: "Preferred carrier:",
          choices: ["UPS", "FedEx", "USPS", "DHL", "No preference"],
          default: "UPS",
        },
      ]);

      apiKey = answers.apiKey;
      apiUrl = answers.apiUrl;

      setConfig({
        apiKey,
        apiUrl,
        defaultCarrier: answers.carrier === "No preference" ? undefined : answers.carrier.toLowerCase(),
      });
    } else {
      setConfig({ apiKey, apiUrl: apiUrl || "http://localhost:3001" });
    }

    // Verify connection
    const spinner = ora("Verifying connection...").start();
    const result = await get("/api/health");

    if (result.error) {
      spinner.warn("Could not connect to server (you can start it later)");
      info(`Config saved. Start the server with ${brand("pnpm dev")}`);
    } else {
      spinner.succeed("Connected to ReturnClaw");
    }

    console.log();
    success("Configuration saved to ~/.returnclaw/config.json");
    console.log();
    info(`Try: ${brand("returnclaw orders")} to list your orders`);
    info(`Try: ${brand('returnclaw return "AirPods from Amazon"')} to start a return`);
    info(`Try: ${brand("returnclaw voice")} to start a voice session`);
    console.log();
  });
