import { ImapFlow, FetchMessageObject, MailboxLockObject } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";

import {
  BaseEmailProvider,
  EmailConnection,
  EmailMessage,
  EmailSearchOptions,
} from "./base";

/**
 * IMAP-specific connection details extracted from EmailConnection.metadata.
 */
interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
}

/**
 * Parse IMAP connection details from the EmailConnection metadata map.
 * Falls back to environment variables and sensible defaults.
 */
function resolveImapConfig(connection: EmailConnection): ImapConfig {
  const meta = connection.metadata ?? {};

  const host =
    meta["imapHost"] ?? process.env.IMAP_HOST ?? "imap.example.com";
  const port = Number(meta["imapPort"] ?? process.env.IMAP_PORT ?? "993");
  const secure =
    (meta["imapSecure"] ?? process.env.IMAP_SECURE ?? "true") === "true";

  return { host, port, secure };
}

/**
 * Default subjects we look for when no explicit query is supplied.
 */
const ORDER_SUBJECTS = [
  "order confirmation",
  "order shipped",
  "your order",
];

export class ImapProvider extends BaseEmailProvider {
  private client: ImapFlow | null = null;

  constructor() {
    super("imap-provider");
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async connect(connection: EmailConnection): Promise<void> {
    this.connection = connection;

    const config = resolveImapConfig(connection);

    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: connection.email,
        pass: connection.accessToken, // For IMAP the "accessToken" carries the password / app-password.
      },
      logger: false, // Silence the built-in logger; we use pino.
    });

    await this.client.connect();

    this.logger.info(
      { email: connection.email, host: config.host },
      "IMAP connection established",
    );
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
    }
    this.connection = null;
    this.logger.info("IMAP provider disconnected");
  }

  async searchMessages(options: EmailSearchOptions): Promise<EmailMessage[]> {
    this.ensureConnected();

    const maxResults = options.maxResults ?? 50;
    const messages: EmailMessage[] = [];

    let lock: MailboxLockObject | null = null;

    try {
      lock = await this.client!.getMailboxLock("INBOX");

      // Build IMAP search criteria.
      const searchCriteria = this.buildSearchCriteria(options);

      // client.search returns an array of sequence numbers / UIDs (or false when nothing matched).
      const searchResult = await this.client!.search(searchCriteria, {
        uid: true,
      });
      const uids: number[] = searchResult || [];

      if (uids.length === 0) {
        this.logger.info("IMAP search returned no results");
        return [];
      }

      this.logger.info(
        { matchCount: uids.length, maxResults },
        "IMAP search matched messages",
      );

      // Fetch most-recent first (highest UID = most recent).
      const sortedUids = [...uids].sort((a, b) => b - a);
      const toFetch = sortedUids.slice(0, maxResults);

      for (const uid of toFetch) {
        const msg = await this.fetchAndParse(uid);
        if (msg) {
          messages.push(msg);
        }
      }
    } finally {
      if (lock) {
        lock.release();
      }
    }

    this.logger.info({ count: messages.length }, "IMAP search complete");
    return messages;
  }

  async getMessageById(messageId: string): Promise<EmailMessage | null> {
    this.ensureConnected();

    const uid = Number(messageId);
    if (Number.isNaN(uid)) {
      this.logger.warn({ messageId }, "Invalid IMAP UID");
      return null;
    }

    let lock: MailboxLockObject | null = null;

    try {
      lock = await this.client!.getMailboxLock("INBOX");
      return await this.fetchAndParse(uid);
    } catch (err: unknown) {
      this.logger.error({ messageId, err }, "Failed to fetch IMAP message");
      return null;
    } finally {
      if (lock) {
        lock.release();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build IMAP SEARCH criteria from EmailSearchOptions.
   *
   * ImapFlow accepts a search tree; we use OR nodes for the default
   * order-related subject patterns when no explicit query is given.
   */
  private buildSearchCriteria(
    options: EmailSearchOptions,
  ): Record<string, unknown> {
    const criteria: Record<string, unknown> = {};

    // Date filter.
    if (options.since) {
      criteria["since"] = options.since;
    } else {
      // Default to the last 30 days.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      criteria["since"] = thirtyDaysAgo;
    }

    if (options.query) {
      // Free-text: use SUBJECT search with the caller-provided value.
      criteria["subject"] = options.query;
    } else {
      // OR across the default order-related subjects.
      // ImapFlow supports nested OR via the `or` key with an array of criteria objects.
      criteria["or"] = ORDER_SUBJECTS.map((subj) => ({ subject: subj }));
    }

    return criteria;
  }

  /**
   * Fetch a single message by UID and parse it into our EmailMessage type.
   */
  private async fetchAndParse(uid: number): Promise<EmailMessage | null> {
    let fetchResult: FetchMessageObject | false;

    try {
      fetchResult = await this.client!.fetchOne(
        String(uid),
        {
          uid: true,
          source: true, // Full RFC 822 source.
          envelope: true,
        },
      );
    } catch (err: unknown) {
      this.logger.warn({ uid, err }, "Could not fetch IMAP message");
      return null;
    }

    if (!fetchResult || !fetchResult.source) {
      return null;
    }

    const fetched = fetchResult;

    const parsed = await simpleParser(fetched.source!) as ParsedMail;

    const headers = new Map<string, string>();
    if (parsed.headers) {
      for (const [key, value] of parsed.headers) {
        // header values can be objects for structured headers; stringify them.
        headers.set(
          key.toLowerCase(),
          typeof value === "string" ? value : String(value),
        );
      }
    }

    const from = this.formatAddress(parsed.from);
    const to = this.formatAddressList(parsed.to);

    return {
      id: String(uid),
      subject: parsed.subject ?? "(no subject)",
      from,
      to,
      date: parsed.date ?? new Date(),
      htmlBody: parsed.html || null,
      textBody: parsed.text ?? null,
      headers,
    };
  }

  /**
   * Format a mailparser AddressObject into a display string.
   */
  private formatAddress(
    addr:
      | import("mailparser").AddressObject
      | import("mailparser").AddressObject[]
      | undefined,
  ): string {
    if (!addr) return "";
    const obj = Array.isArray(addr) ? addr[0] : addr;
    if (!obj || !obj.value || obj.value.length === 0) return "";

    const first = obj.value[0];
    if (first.name) {
      return `${first.name} <${first.address ?? ""}>`;
    }
    return first.address ?? "";
  }

  /**
   * Format a mailparser AddressObject (possibly multiple) into a string array.
   */
  private formatAddressList(
    addr:
      | import("mailparser").AddressObject
      | import("mailparser").AddressObject[]
      | undefined,
  ): string[] {
    if (!addr) return [];
    const objects = Array.isArray(addr) ? addr : [addr];

    const result: string[] = [];
    for (const obj of objects) {
      for (const entry of obj.value) {
        if (entry.name) {
          result.push(`${entry.name} <${entry.address ?? ""}>`);
        } else if (entry.address) {
          result.push(entry.address);
        }
      }
    }
    return result;
  }
}
