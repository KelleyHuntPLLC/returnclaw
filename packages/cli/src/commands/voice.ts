import { Command } from "commander";
import ora from "ora";
import { post } from "../utils/api.js";
import {
  printBanner,
  success,
  error,
  info,
  brand,
  voice,
  dim,
} from "../utils/display.js";

export const voiceCommand = new Command("voice")
  .description("Start a voice session from the terminal")
  .option("--text", "Use text input instead of microphone")
  .action(async (opts) => {
    printBanner();

    console.log(voice("  🎤 Voice Mode"));
    console.log();

    // Get ephemeral token
    const spinner = ora("Connecting to voice service...").start();
    const result = await post<{ token: string; session_id: string }>(
      "/api/voice/token"
    );

    if (result.error) {
      spinner.fail("Failed to connect to voice service");
      error(result.error);
      info("Make sure the ReturnClaw server is running and your API key is valid.");
      return;
    }

    spinner.succeed("Connected to ReturnClaw Voice");
    console.log();

    if (opts.text) {
      // Text mode
      info("Text mode active. Type your commands below.");
      info('Type "exit" to quit.\n');

      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const prompt = () => {
        rl.question(brand("  you > "), async (input) => {
          if (input.trim().toLowerCase() === "exit") {
            console.log();
            info("Voice session ended.");
            rl.close();
            return;
          }

          const thinkingSpinner = ora({
            text: "Thinking...",
            indent: 2,
          }).start();

          // Simulate API call to process text
          const response = await post<{ response: string }>(
            "/api/voice/message",
            { text: input, session_id: result.data?.session_id }
          );

          if (response.error) {
            thinkingSpinner.fail("Error");
            error(response.error);
          } else {
            thinkingSpinner.stop();
            console.log(
              voice("  claw > ") + (response.data?.response || "I didn't catch that.")
            );
          }

          console.log();
          prompt();
        });
      };

      prompt();
    } else {
      // Microphone mode
      info("Microphone mode requires a supported audio input device.");
      info("Press Ctrl+C to stop.\n");

      console.log(dim("  Listening for voice input..."));
      console.log(
        dim("  (In production, this connects to OpenAI Realtime API)")
      );
      console.log();
      info(`Voice session ID: ${dim(result.data?.session_id || "N/A")}`);
      info(
        `For now, try text mode: ${brand("returnclaw voice --text")}`
      );
      console.log();

      // Keep the process running (in production, would be an audio stream)
      info("Press Ctrl+C to exit.");

      // Handle graceful shutdown
      process.on("SIGINT", () => {
        console.log();
        info("Voice session ended.");
        process.exit(0);
      });

      // Keep alive
      await new Promise(() => {});
    }
  });
