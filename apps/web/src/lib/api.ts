/**
 * ReturnClaw API Client
 *
 * Fetch wrapper for communicating with the ReturnClaw gateway.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ApiOptions extends RequestInit {
  params?: Record<string, string>;
}

interface ApiError {
  message: string;
  code: string;
  status: number;
}

class ReturnClawApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<T>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<T> {
    const { params, ...fetchOptions } = options;

    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: "An unexpected error occurred",
        code: "UNKNOWN",
        status: response.status,
      }));
      throw error;
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async signup(name: string, email: string, password: string) {
    return this.request<{ token: string; user: User }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  }

  // Returns
  async getReturns(params?: { status?: string; page?: string; limit?: string }) {
    return this.request<{ returns: Return[]; total: number }>("/api/returns", {
      params,
    });
  }

  async getReturn(id: string) {
    return this.request<Return>(`/api/returns/${id}`);
  }

  async createReturn(data: CreateReturnInput) {
    return this.request<Return>("/api/returns", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Orders
  async getOrders(params?: { page?: string; limit?: string }) {
    return this.request<{ orders: Order[]; total: number }>("/api/orders", {
      params,
    });
  }

  // Voice
  async getVoiceToken() {
    return this.request<{ token: string; expires_at: string }>(
      "/api/voice/token",
      { method: "POST" }
    );
  }

  // Settings
  async getSettings() {
    return this.request<UserSettings>("/api/settings");
  }

  async updateSettings(data: Partial<UserSettings>) {
    return this.request<UserSettings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Dashboard
  async getDashboardStats() {
    return this.request<DashboardStats>("/api/dashboard/stats");
  }

  // Policy
  async getPolicy(retailer: string) {
    return this.request<RetailerPolicy>(`/api/policy/${retailer}`);
  }
}

// Types
export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
}

export interface Return {
  id: string;
  order_id: string;
  retailer: string;
  item_name: string;
  item_image?: string;
  amount: number;
  status: "pending" | "approved" | "in_transit" | "delivered" | "refunded" | "rejected";
  reason: string;
  tracking_number?: string;
  label_url?: string;
  created_at: string;
  updated_at: string;
  estimated_refund_date?: string;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  id: string;
  status: string;
  description: string;
  timestamp: string;
}

export interface Order {
  id: string;
  retailer: string;
  retailer_order_id: string;
  items: OrderItem[];
  total: number;
  order_date: string;
  delivery_date?: string;
  return_eligible: boolean;
  return_deadline?: string;
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

export interface CreateReturnInput {
  order_id: string;
  item_name: string;
  reason: string;
  description?: string;
}

export interface UserSettings {
  email_connections: EmailConnection[];
  preferred_carrier: string;
  notification_preferences: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  default_pickup_address?: Address;
}

export interface EmailConnection {
  id: string;
  provider: "gmail" | "outlook" | "yahoo";
  email: string;
  connected: boolean;
  last_synced?: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface DashboardStats {
  returns_this_month: number;
  money_saved: number;
  active_returns: number;
  avg_return_days: number;
  returns_trend: number;
  money_trend: number;
}

export interface RetailerPolicy {
  retailer: string;
  return_window_days: number;
  free_returns: boolean;
  restocking_fee?: number;
  conditions: string[];
  process: string;
}

// Singleton instance
export const api = new ReturnClawApiClient(API_BASE_URL);
export default api;
