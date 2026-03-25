/**
 * CLI Display Utilities
 *
 * Terminal output formatting, tables, and styling.
 */

import chalk from "chalk";

export const brand = chalk.hex("#10b981"); // brand-500 emerald
export const voice = chalk.hex("#8b5cf6"); // voice-500 violet
export const warn = chalk.yellow;
export const err = chalk.red;
export const dim = chalk.gray;
export const bold = chalk.bold;

/** Print the ReturnClaw banner */
export function printBanner(): void {
  console.log();
  console.log(brand.bold("  🦞 ReturnClaw"));
  console.log(dim("  Voice-first AI agent for online returns"));
  console.log();
}

/** Print a success message */
export function success(message: string): void {
  console.log(brand("  ✓ ") + message);
}

/** Print an error message */
export function error(message: string): void {
  console.log(err("  ✗ ") + message);
}

/** Print a warning message */
export function warning(message: string): void {
  console.log(warn("  ⚠ ") + message);
}

/** Print an info message */
export function info(message: string): void {
  console.log(dim("  ℹ ") + message);
}

/** Print a key-value pair */
export function keyValue(key: string, value: string): void {
  console.log(`  ${dim(key + ":")} ${value}`);
}

/** Format currency */
export function formatMoney(amount: number): string {
  return brand.bold(`$${amount.toFixed(2)}`);
}

/** Format a status badge */
export function statusBadge(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    pending: chalk.yellow,
    approved: brand,
    in_transit: chalk.blue,
    delivered: chalk.cyan,
    refunded: brand.bold,
    rejected: chalk.red,
  };
  const colorFn = colors[status] || dim;
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return colorFn(`[${label}]`);
}

/** Print a simple table */
export function printTable(
  headers: string[],
  rows: string[][],
  widths?: number[]
): void {
  const colWidths =
    widths ||
    headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => (r[i] || "").length)) + 2
    );

  // Header
  const headerLine = headers
    .map((h, i) => dim(h.padEnd(colWidths[i])))
    .join("");
  console.log(`  ${headerLine}`);
  console.log(`  ${dim("─".repeat(colWidths.reduce((a, b) => a + b, 0)))}`);

  // Rows
  for (const row of rows) {
    const line = row.map((cell, i) => cell.padEnd(colWidths[i])).join("");
    console.log(`  ${line}`);
  }
}

/** Print a divider */
export function divider(): void {
  console.log(dim("  " + "─".repeat(50)));
}
