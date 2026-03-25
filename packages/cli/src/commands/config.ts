import { Command } from "commander";
import { getConfig, setConfig, clearConfig, type CliConfig } from "../utils/auth.js";
import {
  printBanner,
  success,
  error,
  keyValue,
  divider,
  dim,
  brand,
} from "../utils/display.js";

const configCommand = new Command("config").description("Manage CLI configuration");

configCommand
  .command("get [key]")
  .description("Show configuration values")
  .action((key?: string) => {
    printBanner();

    const config = getConfig();

    if (key) {
      const value = config[key as keyof CliConfig];
      if (value !== undefined) {
        keyValue(key, String(value));
      } else {
        error(`Unknown config key: ${key}`);
      }
    } else {
      divider();
      const entries = Object.entries(config);
      if (entries.length === 0) {
        console.log(dim("  No configuration set. Run `returnclaw init` first."));
      } else {
        for (const [k, v] of entries) {
          if (k === "apiKey") {
            keyValue(k, v ? `${String(v).slice(0, 6)}${"•".repeat(20)}` : dim("not set"));
          } else {
            keyValue(k, String(v) || dim("not set"));
          }
        }
      }
      divider();
    }
    console.log();
  });

configCommand
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key: string, value: string) => {
    printBanner();

    const validKeys: (keyof CliConfig)[] = [
      "apiKey",
      "apiUrl",
      "defaultCarrier",
      "email",
      "outputFormat",
    ];

    if (!validKeys.includes(key as keyof CliConfig)) {
      error(`Invalid config key: ${key}`);
      console.log(dim(`  Valid keys: ${validKeys.join(", ")}`));
      return;
    }

    setConfig({ [key]: value });
    success(`Set ${key} = ${key === "apiKey" ? value.slice(0, 6) + "•••" : value}`);
    console.log();
  });

configCommand
  .command("reset")
  .description("Reset all configuration")
  .action(() => {
    printBanner();
    clearConfig();
    success("Configuration reset.");
    console.log(dim(`  Run ${brand("returnclaw init")} to reconfigure.`));
    console.log();
  });

configCommand
  .command("path")
  .description("Show config file path")
  .action(() => {
    const { homedir } = require("node:os");
    const { join } = require("node:path");
    console.log(join(homedir(), ".returnclaw", "config.json"));
  });

export { configCommand };
