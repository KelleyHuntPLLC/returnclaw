/**
 * ReturnClaw CLI API Client
 *
 * Handles HTTP requests to the ReturnClaw gateway.
 */

import { getConfig } from "./auth.js";

const DEFAULT_API_URL = "http://localhost:3001";

interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

export async function apiRequest<T>(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const config = getConfig();
  const apiUrl = config.apiUrl || DEFAULT_API_URL;
  const apiKey = config.apiKey;

  if (!apiKey) {
    return {
      error: "Not authenticated. Run `returnclaw init` first.",
      status: 401,
    };
  }

  try {
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data: any = await response.json();

    if (!response.ok) {
      return {
        error: data.message || `Request failed with status ${response.status}`,
        status: response.status,
      };
    }

    return { data: data as T, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      error: `Connection failed: ${message}. Is the ReturnClaw server running?`,
      status: 0,
    };
  }
}

export async function get<T>(endpoint: string): Promise<ApiResponse<T>> {
  return apiRequest<T>("GET", endpoint);
}

export async function post<T>(
  endpoint: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  return apiRequest<T>("POST", endpoint, body);
}
