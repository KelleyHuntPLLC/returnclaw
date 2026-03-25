import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

import {
  BaseEmailProvider,
  EmailConnection,
  EmailMessage,
  EmailSearchOptions,
} from "./base";

/**
 * Simple sliding-window rate limiter.
 *
 * Gmail API default quota is 250 quota-units / second for a user.
 * messages.list = 5 units, messages.get = 5 units.
 * We track call timestamps and pause when we approach the ceiling.
 */
class GmailRateLimiter {
  private readonly maxUnitsPerSecond: number;
  private readonly timestamps: { time: number; units: number }[] = [];

  constructor(maxUnitsPerSecond = 250) {
    this.maxUnitsPerSecond = maxUnitsPerSecond;
  }

  /**
   * Wait (if necessary) so we don't exceed the quota, then record the call.
   */
  async consume(units: number): Promise<void> {
    const now = Date.now();
    // Evict entries older than 1 second.
    while (this.timestamps.length > 0 && now - this.timestamps[0].time > 1000) {
      this.timestamps.shift();
    }

    const usedUnits = this.timestamps.reduce((sum, e) => sum + e.units, 0);

    if (usedUnits + units > this.maxUnitsPerSecond) {
      // Delay until the oldest entry slides out of the window.
      const waitMs =
        this.timestamps.length > 0
          ? 1000 - (now - this.timestamps[0].time)
          : 100;
      await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 50)));
      // Recurse after waiting – re-check the window.
      return this.consume(units);
    }

    this.timestamps.push({ time: Date.now(), units });
  }
}

const GMAIL_API_UNITS_LIST = 5;
const GMAIL_API_UNITS_GET = 5;

const DEFAULT_ORDER_QUERY =
  "subject:(order confirmation OR order shipped OR your order)";

export class GmailProvider extends BaseEmailProvider {
  private oauth2Client: OAuth2Client | null = null;
  private gmail: gmail_v1.Gmail | null = null;
  private rateLimiter: GmailRateLimiter;

  constructor() {
    super("gmail-provider");
    this.rateLimiter = new GmailRateLimiter(
      Number(process.env.GMAIL_RATE_LIMIT) || 250,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async connect(connection: EmailConnection): Promise<void> {
    this.connection = connection;

    this.oauth2Client = new OAuth2Client(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI,
    );

    this.oauth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
    });

    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });

    // Validate that the token is usable by hitting a lightweight endpoint.
    try {
      await this.gmail.users.getProfile({ userId: "me" });
      this.logger.info(
        { email: connection.email },
        "Gmail connection validated",
      );
    } catch (err: unknown) {
      this.logger.warn("Access token may be expired – attempting refresh");
      await this.refreshTokenIfNeeded();
      // Retry validation after refresh.
      await this.gmail.users.getProfile({ userId: "me" });
      this.logger.info(
        { email: connection.email },
        "Gmail connection validated after token refresh",
      );
    }
  }

  async disconnect(): Promise<void> {
    this.oauth2Client = null;
    this.gmail = null;
    this.connection = null;
    this.logger.info("Gmail provider disconnected");
  }

  async searchMessages(options: EmailSearchOptions): Promise<EmailMessage[]> {
    this.ensureConnected();

    const query = this.buildSearchQuery(options);
    const maxResults = options.maxResults ?? 50;
    const messages: EmailMessage[] = [];
    let pageToken: string | undefined;

    this.logger.info({ query, maxResults }, "Searching Gmail messages");

    do {
      await this.rateLimiter.consume(GMAIL_API_UNITS_LIST);

      const res = await this.gmail!.users.messages.list({
        userId: "me",
        q: query,
        maxResults: Math.min(maxResults - messages.length, 100),
        pageToken,
      });

      const messageRefs = res.data.messages ?? [];

      for (const ref of messageRefs) {
        if (messages.length >= maxResults) break;

        await this.rateLimiter.consume(GMAIL_API_UNITS_GET);

        const full = await this.gmail!.users.messages.get({
          userId: "me",
          id: ref.id!,
          format: "full",
        });

        const parsed = this.parseGmailMessage(full.data);
        if (parsed) {
          messages.push(parsed);
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && messages.length < maxResults);

    this.logger.info({ count: messages.length }, "Gmail search complete");
    return messages;
  }

  async getMessageById(messageId: string): Promise<EmailMessage | null> {
    this.ensureConnected();

    try {
      await this.rateLimiter.consume(GMAIL_API_UNITS_GET);

      const res = await this.gmail!.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      return this.parseGmailMessage(res.data);
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status === 404) {
        this.logger.warn({ messageId }, "Gmail message not found");
        return null;
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a Gmail search query string from EmailSearchOptions.
   */
  private buildSearchQuery(options: EmailSearchOptions): string {
    const parts: string[] = [];

    if (options.query) {
      parts.push(options.query);
    } else {
      parts.push(DEFAULT_ORDER_QUERY);
    }

    if (options.since) {
      // Gmail "after:" accepts epoch seconds.
      const epochSeconds = Math.floor(options.since.getTime() / 1000);
      parts.push(`after:${epochSeconds}`);
    } else {
      parts.push("newer_than:30d");
    }

    return parts.join(" ");
  }

  /**
   * Convert a raw Gmail API message resource into our canonical EmailMessage.
   */
  private parseGmailMessage(
    msg: gmail_v1.Schema$Message,
  ): EmailMessage | null {
    if (!msg.id || !msg.payload) return null;

    const headers = new Map<string, string>();
    for (const header of msg.payload.headers ?? []) {
      if (header.name && header.value) {
        headers.set(header.name.toLowerCase(), header.value);
      }
    }

    const subject = headers.get("subject") ?? "(no subject)";
    const from = headers.get("from") ?? "";
    const toRaw = headers.get("to") ?? "";
    const to = toRaw
      .split(",")
      .map((addr) => addr.trim())
      .filter(Boolean);
    const dateStr = headers.get("date");
    const date = dateStr ? new Date(dateStr) : new Date();

    const { htmlBody, textBody } = this.extractBodies(msg.payload);

    return {
      id: msg.id,
      subject,
      from,
      to,
      date,
      htmlBody,
      textBody,
      headers,
    };
  }

  /**
   * Walk the MIME tree to extract text/plain and text/html parts.
   */
  private extractBodies(payload: gmail_v1.Schema$MessagePart): {
    htmlBody: string | null;
    textBody: string | null;
  } {
    let htmlBody: string | null = null;
    let textBody: string | null = null;

    const walk = (part: gmail_v1.Schema$MessagePart): void => {
      const mimeType = part.mimeType ?? "";

      if (mimeType === "text/html" && part.body?.data) {
        htmlBody = this.decodeBase64Url(part.body.data);
      } else if (mimeType === "text/plain" && part.body?.data) {
        textBody = this.decodeBase64Url(part.body.data);
      }

      if (part.parts) {
        for (const child of part.parts) {
          walk(child);
        }
      }
    };

    walk(payload);

    // For single-part messages the body may be on the top-level payload.
    if (!htmlBody && !textBody && payload.body?.data) {
      const decoded = this.decodeBase64Url(payload.body.data);
      if ((payload.mimeType ?? "").includes("html")) {
        htmlBody = decoded;
      } else {
        textBody = decoded;
      }
    }

    return { htmlBody, textBody };
  }

  /**
   * Gmail encodes body data as URL-safe base64 (RFC 4648 §5).
   */
  private decodeBase64Url(encoded: string): string {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  }

  /**
   * Refresh the OAuth2 access token using the stored refresh token.
   * Updates both the internal client and the stored connection.
   */
  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.oauth2Client || !this.connection) {
      throw new Error("Cannot refresh token – provider not initialised");
    }

    this.logger.info("Refreshing Gmail OAuth2 access token");

    const { credentials } = await this.oauth2Client.refreshAccessToken();

    this.oauth2Client.setCredentials(credentials);

    if (credentials.access_token) {
      this.connection.accessToken = credentials.access_token;
    }
    if (credentials.refresh_token) {
      this.connection.refreshToken = credentials.refresh_token;
    }

    this.logger.info("Gmail access token refreshed successfully");
  }
}
