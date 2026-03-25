/**
 * CLI Authentication & Configuration
 *
 * Stores API key and configuration in the user's home directory.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".returnclaw");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface CliConfig {
  apiKey?: string;
  apiUrl?: string;
  defaultCarrier?: string;
  email?: string;
  outputFormat?: "table" | "json";
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfig(): CliConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export function setConfig(updates: Partial<CliConfig>): void {
  ensureConfigDir();
  const current = getConfig();
  const merged = { ...current, ...updates };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
}

export function getApiKey(): string | undefined {
  return getConfig().apiKey;
}

export function isAuthenticated(): boolean {
  return !!getApiKey();
}

export function clearConfig(): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, "{}", "utf-8");
}
