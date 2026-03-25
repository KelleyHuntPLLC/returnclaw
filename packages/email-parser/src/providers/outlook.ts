import { Client, PageCollection } from "@microsoft/microsoft-graph-client";

import {
  BaseEmailProvider,
  EmailConnection,
  EmailMessage,
  EmailSearchOptions,
} from "./base";

/**
 * Shape of a Microsoft Graph mail message resource (trimmed to the fields we use).
 * @see https://learn.microsoft.com/en-us/graph/api/resources/message
 */
interface GraphMailMessage {
  id: string;
  subject: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{
    emailAddress?: { address?: string; name?: string };
  }>;
  receivedDateTime?: string;
  body?: { contentType?: string; content?: string };
  internetMessageHeaders?: Array<{ name?: string; value?: string }>;
}

const DEFAULT_ORDER_SEARCH =
  '("order confirmation" OR "order shipped" OR "your order")';

const AZURE_AD_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export class OutlookProvider extends BaseEmailProvider {
  private graphClient: Client | null = null;

  constructor() {
    super("outlook-provider");
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async connect(connection: EmailConnection): Promise<void> {
    this.connection = connection;

    this.graphClient = Client.init({
      authProvider: (done) => {
        // The Graph client calls this callback before every request.
        // We hand it the current access token.
        done(null, this.connection!.accessToken);
      },
    });

    // Validate the token by hitting a lightweight endpoint.
    try {
      await this.graphClient.api("/me").select("displayName").get();
      this.logger.info(
        { email: connection.email },
        "Outlook connection validated",
      );
    } catch (err: unknown) {
      this.logger.warn("Access token invalid – attempting refresh");
      await this.refreshToken();
      // Re-initialise client with the new token.
      this.graphClient = Client.init({
        authProvider: (done) => {
          done(null, this.connection!.accessToken);
        },
      });
      await this.graphClient.api("/me").select("displayName").get();
      this.logger.info(
        { email: connection.email },
        "Outlook connection validated after token refresh",
      );
    }
  }

  async disconnect(): Promise<void> {
    this.graphClient = null;
    this.connection = null;
    this.logger.info("Outlook provider disconnected");
  }

  async searchMessages(options: EmailSearchOptions): Promise<EmailMessage[]> {
    this.ensureConnected();

    const maxResults = options.maxResults ?? 50;
    const messages: EmailMessage[] = [];

    let apiRequest = this.graphClient!.api("/me/messages")
      .header("Prefer", 'outlook.body-content-type="html"')
      .select(
        "id,subject,from,toRecipients,receivedDateTime,body,internetMessageHeaders",
      )
      .top(Math.min(maxResults, 100))
      .orderby("receivedDateTime desc");

    // Apply filters.
    const filters = this.buildFilterClauses(options);
    if (filters) {
      apiRequest = apiRequest.filter(filters);
    }

    // If the caller supplied a free-text query (or we fall back to the default)
    // use $search. $search and $filter can coexist on /me/messages in Graph v1.
    const searchTerm = options.query ?? DEFAULT_ORDER_SEARCH;
    apiRequest = apiRequest.search(`"${searchTerm}"`);

    this.logger.info({ searchTerm, maxResults }, "Searching Outlook messages");

    // Paginated fetch.
    let response: PageCollection = await apiRequest.get();

    while (true) {
      const pageMessages: GraphMailMessage[] = response.value ?? [];

      for (const gMsg of pageMessages) {
        if (messages.length >= maxResults) break;
        messages.push(this.mapGraphMessage(gMsg));
      }

      if (messages.length >= maxResults) break;

      const nextLink: string | undefined = response["@odata.nextLink"];
      if (!nextLink) break;

      response = await this.graphClient!.api(nextLink).get();
    }

    this.logger.info({ count: messages.length }, "Outlook search complete");
    return messages;
  }

  async getMessageById(messageId: string): Promise<EmailMessage | null> {
    this.ensureConnected();

    try {
      const gMsg: GraphMailMessage = await this.graphClient!
        .api(`/me/messages/${messageId}`)
        .header("Prefer", 'outlook.body-content-type="html"')
        .select(
          "id,subject,from,toRecipients,receivedDateTime,body,internetMessageHeaders",
        )
        .get();

      return this.mapGraphMessage(gMsg);
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        this.logger.warn({ messageId }, "Outlook message not found");
        return null;
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build OData $filter clauses from search options.
   */
  private buildFilterClauses(options: EmailSearchOptions): string | null {
    const clauses: string[] = [];

    if (options.since) {
      const iso = options.since.toISOString();
      clauses.push(`receivedDateTime ge ${iso}`);
    }

    return clauses.length > 0 ? clauses.join(" and ") : null;
  }

  /**
   * Map a Graph API mail message to our canonical EmailMessage shape.
   */
  private mapGraphMessage(gMsg: GraphMailMessage): EmailMessage {
    const headers = new Map<string, string>();
    if (gMsg.internetMessageHeaders) {
      for (const h of gMsg.internetMessageHeaders) {
        if (h.name && h.value) {
          headers.set(h.name.toLowerCase(), h.value);
        }
      }
    }

    const fromAddress = gMsg.from?.emailAddress?.address ?? "";
    const fromName = gMsg.from?.emailAddress?.name;
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    const to: string[] = (gMsg.toRecipients ?? []).map((r) => {
      const addr = r.emailAddress?.address ?? "";
      const name = r.emailAddress?.name;
      return name ? `${name} <${addr}>` : addr;
    });

    const contentType = gMsg.body?.contentType?.toLowerCase() ?? "html";
    const bodyContent = gMsg.body?.content ?? null;

    const htmlBody = contentType === "html" ? bodyContent : null;
    const textBody = contentType === "text" ? bodyContent : null;

    return {
      id: gMsg.id,
      subject: gMsg.subject ?? "(no subject)",
      from,
      to,
      date: gMsg.receivedDateTime
        ? new Date(gMsg.receivedDateTime)
        : new Date(),
      htmlBody,
      textBody,
      headers,
    };
  }

  /**
   * Refresh the OAuth2 access token via the Azure AD token endpoint using the
   * refresh_token grant type.
   */
  private async refreshToken(): Promise<void> {
    if (!this.connection) {
      throw new Error("Cannot refresh token – provider not connected");
    }

    const clientId =
      this.connection.metadata?.["clientId"] ??
      process.env.OUTLOOK_CLIENT_ID ??
      "";
    const clientSecret =
      this.connection.metadata?.["clientSecret"] ??
      process.env.OUTLOOK_CLIENT_SECRET ??
      "";

    this.logger.info("Refreshing Outlook access token via Azure AD");

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: this.connection.refreshToken,
      scope: "https://graph.microsoft.com/.default offline_access",
    });

    const res = await fetch(AZURE_AD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(
        { status: res.status, body: errText },
        "Failed to refresh Outlook token",
      );
      throw new Error(`Outlook token refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    this.connection.accessToken = data.access_token;
    if (data.refresh_token) {
      this.connection.refreshToken = data.refresh_token;
    }

    this.logger.info("Outlook access token refreshed successfully");
  }
}
