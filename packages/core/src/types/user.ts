import type { Address } from './carrier.js';

export interface User {
  id: string;
  email: string;
  name?: string;
  emailConnections: EmailConnection[];
  addresses: Address[];
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailConnection {
  provider: 'gmail' | 'outlook' | 'yahoo' | 'imap';
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  lastSyncedAt: Date;
  status: 'active' | 'expired' | 'error';
}

export interface UserPreferences {
  defaultCarrier?: string;
  defaultAddress?: string;
  notificationChannels: ('email' | 'sms' | 'push')[];
  voiceEnabled: boolean;
  autoSchedulePickup: boolean;
  timezone: string;
}
