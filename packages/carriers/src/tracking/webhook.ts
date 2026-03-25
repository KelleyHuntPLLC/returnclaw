import pino from 'pino';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  CarrierCode,
  TrackingStatus,
  TrackingEvent,
  TrackingEventCode,
} from '../providers/base';

const logger = pino({ name: 'carriers:webhook-handler' });

export interface WebhookPayload {
  carrier: CarrierCode;
  rawBody: string;
  headers: Record<string, string>;
  timestamp: Date;
}

export interface WebhookConfig {
  ups?: { webhookSecret: string };
  fedex?: { webhookSecret: string };
  usps?: { webhookSecret: string };
  dhl?: { webhookSecret: string };
}

interface NormalizedWebhookEvent {
  trackingNumber: string;
  carrierId: CarrierCode;
  status: TrackingEventCode;
  event: TrackingEvent;
  rawPayload: unknown;
}

export class CarrierWebhookHandler extends EventEmitter {
  private readonly config: WebhookConfig;

  constructor(config: WebhookConfig) {
    super();
    this.config = config;
  }

  /**
   * Processes an incoming webhook from a carrier.
   * Validates the signature, parses the payload, and emits normalized events.
   */
  async handleWebhook(payload: WebhookPayload): Promise<NormalizedWebhookEvent | null> {
    logger.info(
      { carrier: payload.carrier, timestamp: payload.timestamp },
      'Received carrier webhook',
    );

    // Validate webhook signature
    if (!this.validateSignature(payload)) {
      logger.warn({ carrier: payload.carrier }, 'Invalid webhook signature');
      throw new Error('Invalid webhook signature');
    }

    // Parse based on carrier
    let event: NormalizedWebhookEvent | null = null;

    switch (payload.carrier) {
      case 'ups':
        event = this.parseUPSWebhook(payload.rawBody);
        break;
      case 'fedex':
        event = this.parseFedExWebhook(payload.rawBody);
        break;
      case 'usps':
        event = this.parseUSPSWebhook(payload.rawBody);
        break;
      case 'dhl':
        event = this.parseDHLWebhook(payload.rawBody);
        break;
      default:
        logger.warn({ carrier: payload.carrier }, 'Unknown carrier for webhook');
        return null;
    }

    if (event) {
      this.emit('tracking:update', event);
      this.emit(`tracking:${event.status}`, event);
      logger.info(
        {
          trackingNumber: event.trackingNumber,
          carrier: event.carrierId,
          status: event.status,
        },
        'Webhook event processed',
      );
    }

    return event;
  }

  /**
   * Validates the webhook signature using the carrier's secret.
   */
  private validateSignature(payload: WebhookPayload): boolean {
    const carrierConfig = this.config[payload.carrier];
    if (!carrierConfig?.webhookSecret) {
      logger.debug({ carrier: payload.carrier }, 'No webhook secret configured, skipping validation');
      return true; // Skip validation if no secret configured
    }

    const signature = payload.headers['x-webhook-signature']
      || payload.headers['x-signature']
      || payload.headers['x-hub-signature-256'];

    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', carrierConfig.webhookSecret)
      .update(payload.rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Parses a UPS Tracking webhook payload.
   */
  private parseUPSWebhook(rawBody: string): NormalizedWebhookEvent | null {
    const data = JSON.parse(rawBody);

    const trackingNumber = data.trackingNumber
      || data.shipmentIdentificationNumber
      || data.inquiryNumber;

    if (!trackingNumber) {
      logger.warn('UPS webhook missing tracking number');
      return null;
    }

    const upsStatus = data.status?.type || data.activityStatus || '';
    const status = this.mapUPSStatus(upsStatus);

    return {
      trackingNumber,
      carrierId: 'ups',
      status,
      event: {
        timestamp: new Date(data.dateTime || data.timestamp || Date.now()),
        status,
        description: data.status?.description || data.activityDescription || upsStatus,
        location: this.formatLocation(data.activityLocation || data.location),
      },
      rawPayload: data,
    };
  }

  /**
   * Parses a FedEx tracking webhook payload.
   */
  private parseFedExWebhook(rawBody: string): NormalizedWebhookEvent | null {
    const data = JSON.parse(rawBody);

    const trackingInfo = data.output?.completeTrackResults?.[0]?.trackResults?.[0]
      || data.trackingInfo
      || data;

    const trackingNumber = trackingInfo.trackingNumberInfo?.trackingNumber
      || trackingInfo.trackingNumber
      || data.trackingNumber;

    if (!trackingNumber) {
      logger.warn('FedEx webhook missing tracking number');
      return null;
    }

    const latestEvent = trackingInfo.scanEvents?.[0]
      || trackingInfo.latestStatusDetail
      || {};

    const fedexStatus = latestEvent.derivedStatusCode
      || latestEvent.statusCode
      || '';
    const status = this.mapFedExStatus(fedexStatus);

    return {
      trackingNumber,
      carrierId: 'fedex',
      status,
      event: {
        timestamp: new Date(latestEvent.date || latestEvent.timestamp || Date.now()),
        status,
        description: latestEvent.eventDescription || latestEvent.description || fedexStatus,
        location: this.formatLocation(latestEvent.scanLocation),
      },
      rawPayload: data,
    };
  }

  /**
   * Parses a USPS tracking webhook payload.
   */
  private parseUSPSWebhook(rawBody: string): NormalizedWebhookEvent | null {
    const data = JSON.parse(rawBody);

    const trackingNumber = data.trackingNumber || data.TrackingNumber;

    if (!trackingNumber) {
      logger.warn('USPS webhook missing tracking number');
      return null;
    }

    const event = data.trackSummary || data.latestEvent || {};
    const uspsStatus = event.eventType || event.EventType || '';
    const status = this.mapUSPSStatus(uspsStatus);

    return {
      trackingNumber,
      carrierId: 'usps',
      status,
      event: {
        timestamp: new Date(event.eventTimestamp || event.EventDate || Date.now()),
        status,
        description: event.eventDescription || event.Event || uspsStatus,
        location: event.eventCity
          ? `${event.eventCity}, ${event.eventState} ${event.eventZIPCode}`
          : undefined,
      },
      rawPayload: data,
    };
  }

  /**
   * Parses a DHL tracking webhook payload.
   */
  private parseDHLWebhook(rawBody: string): NormalizedWebhookEvent | null {
    const data = JSON.parse(rawBody);

    const shipment = data.shipments?.[0] || data;
    const trackingNumber = shipment.id || shipment.trackingNumber || data.awbNumber;

    if (!trackingNumber) {
      logger.warn('DHL webhook missing tracking number');
      return null;
    }

    const latestEvent = shipment.events?.[0] || {};
    const dhlStatus = latestEvent.statusCode || shipment.status?.statusCode || '';
    const status = this.mapDHLStatus(dhlStatus);

    return {
      trackingNumber,
      carrierId: 'dhl',
      status,
      event: {
        timestamp: new Date(latestEvent.timestamp || Date.now()),
        status,
        description: latestEvent.description || latestEvent.status || dhlStatus,
        location: latestEvent.location?.address?.addressLocality,
      },
      rawPayload: data,
    };
  }

  private mapUPSStatus(code: string): TrackingEventCode {
    const upperCode = code.toUpperCase();
    const mapping: Record<string, TrackingEventCode> = {
      'P': 'picked_up',
      'I': 'in_transit',
      'O': 'out_for_delivery',
      'D': 'delivered',
      'X': 'exception',
      'RS': 'returned',
      'M': 'created',
      'MV': 'in_transit',
      'OR': 'out_for_delivery',
      'DL': 'delivered',
    };
    return mapping[upperCode] || 'in_transit';
  }

  private mapFedExStatus(code: string): TrackingEventCode {
    const upperCode = code.toUpperCase();
    const mapping: Record<string, TrackingEventCode> = {
      'PU': 'picked_up',
      'IT': 'in_transit',
      'OD': 'out_for_delivery',
      'DL': 'delivered',
      'DE': 'exception',
      'CA': 'exception',
      'RS': 'returned',
      'OC': 'created',
      'DP': 'in_transit',
      'AR': 'in_transit',
      'CD': 'exception',
    };
    return mapping[upperCode] || 'in_transit';
  }

  private mapUSPSStatus(eventType: string): TrackingEventCode {
    const lower = eventType.toLowerCase();
    if (lower.includes('delivered')) return 'delivered';
    if (lower.includes('out for delivery')) return 'out_for_delivery';
    if (lower.includes('picked up') || lower.includes('accepted')) return 'picked_up';
    if (lower.includes('in transit') || lower.includes('departed') || lower.includes('arrived')) return 'in_transit';
    if (lower.includes('alert') || lower.includes('exception') || lower.includes('notice')) return 'exception';
    if (lower.includes('return')) return 'returned';
    return 'in_transit';
  }

  private mapDHLStatus(code: string): TrackingEventCode {
    const upperCode = code.toUpperCase();
    const mapping: Record<string, TrackingEventCode> = {
      'pre-transit': 'created',
      'transit': 'in_transit',
      'delivered': 'delivered',
      'failure': 'exception',
      'return': 'returned',
      'PU': 'picked_up',
      'PL': 'picked_up',
      'DF': 'in_transit',
      'AR': 'in_transit',
      'OD': 'out_for_delivery',
      'DL': 'delivered',
      'BN': 'exception',
      'NH': 'exception',
      'RT': 'returned',
    };
    return mapping[upperCode] || 'in_transit';
  }

  private formatLocation(location: unknown): string | undefined {
    if (!location) return undefined;
    if (typeof location === 'string') return location;
    if (typeof location === 'object' && location !== null) {
      const loc = location as Record<string, string>;
      const parts = [loc.city, loc.state || loc.stateProvince, loc.postalCode || loc.zip, loc.country].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : undefined;
    }
    return undefined;
  }
}
