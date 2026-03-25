/**
 * ReturnClaw — Voice-first AI agent for consumer returns
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 * Source-available license. See LICENSE.md for terms.
 * https://kelleyhunt.law
 */
#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { returnCommand } from "./commands/return.js";
import { ordersCommand } from "./commands/orders.js";
import { statusCommand } from "./commands/status.js";
import { policyCommand } from "./commands/policy.js";
import { voiceCommand } from "./commands/voice.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("returnclaw")
  .description("ReturnClaw CLI — voice-first AI agent for online returns")
  .version("0.1.0")
  .addCommand(initCommand)
  .addCommand(returnCommand)
  .addCommand(ordersCommand)
  .addCommand(statusCommand)
  .addCommand(policyCommand)
  .addCommand(voiceCommand)
  .addCommand(configCommand);

program.parse();
