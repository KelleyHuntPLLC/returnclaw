import pino from "pino";

export enum ProviderType {
  GMAIL = "GMAIL",
  OUTLOOK = "OUTLOOK",
  IMAP = "IMAP",
}

/** @deprecated Use ProviderType instead */
export const Provider = ProviderType;
export type Provider = ProviderType;

export interface EmailConnection {
  userId: string;
  provider: Provider;
  accessToken: string;
  refreshToken: string;
  email: string;
  /** Optional metadata for provider-specific config (e.g. IMAP host/port). */
  metadata?: Record<string, string>;
}

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  to: string[];
  date: Date;
  htmlBody: string | null;
  textBody: string | null;
  headers: Map<string, string>;
}

export interface EmailSearchOptions {
  query?: string;
  since?: Date;
  maxResults?: number;
}

export abstract class BaseEmailProvider {
  protected logger: pino.Logger;
  protected connection: EmailConnection | null = null;

  constructor(loggerName?: string) {
    this.logger = pino({
      name: loggerName ?? "email-provider",
      level: process.env.LOG_LEVEL ?? "info",
    });
  }

  /**
   * Establish a connection to the email provider using the supplied credentials.
   */
  abstract connect(connection: EmailConnection): Promise<void>;

  /**
   * Gracefully tear down the provider connection.
   */
  abstract disconnect(): Promise<void>;

  /**
   * Search for messages matching the given options.
   */
  abstract searchMessages(options: EmailSearchOptions): Promise<EmailMessage[]>;

  /**
   * Retrieve a single message by its provider-specific ID.
   * Returns null when the message cannot be found.
   */
  abstract getMessageById(messageId: string): Promise<EmailMessage | null>;

  /**
   * Guard that throws if connect() has not been called yet.
   */
  protected ensureConnected(): void {
    if (!this.connection) {
      throw new Error(
        "Provider is not connected. Call connect() before performing operations.",
      );
    }
  }
}
