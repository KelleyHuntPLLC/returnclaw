import pino from 'pino';
import cron from 'node-cron';
import { EventEmitter } from 'events';
import {
  CarrierCode,
  BaseCarrierProvider,
  TrackingStatus,
  TrackingEvent,
  TrackingEventCode,
} from '../providers/base';

const logger = pino({ name: 'carriers:shipment-tracker' });

interface TrackedShipment {
  trackingNumber: string;
  carrierId: CarrierCode;
  lastStatus?: TrackingEventCode;
  lastCheckedAt?: Date;
  events: TrackingEvent[];
  isActive: boolean;
  metadata?: Record<string, string>;
}

export class ShipmentTracker extends EventEmitter {
  private readonly providers: Map<CarrierCode, BaseCarrierProvider>;
  private readonly trackedShipments: Map<string, TrackedShipment> = new Map();
  private pollingTask?: cron.ScheduledTask;
  private isRunning: boolean = false;

  constructor(providers: Map<CarrierCode, BaseCarrierProvider>) {
    super();
    this.providers = providers;
  }

  /**
   * Starts polling for tracking updates on all active shipments.
   * Default: every 2 hours.
   */
  startPolling(cronExpression: string = '0 */2 * * *'): void {
    if (this.isRunning) {
      logger.warn('Tracker is already polling');
      return;
    }

    this.isRunning = true;
    this.pollingTask = cron.schedule(cronExpression, () => {
      this.pollAllShipments();
    });

    logger.info(
      { cron: cronExpression, activeShipments: this.trackedShipments.size },
      'Shipment tracking polling started',
    );
  }

  /**
   * Stops the polling loop.
   */
  stopPolling(): void {
    if (this.pollingTask) {
      this.pollingTask.stop();
      this.pollingTask = undefined;
    }
    this.isRunning = false;
    logger.info('Shipment tracking polling stopped');
  }

  /**
   * Adds a shipment to track.
   */
  trackShipment(
    trackingNumber: string,
    carrierId: CarrierCode,
    metadata?: Record<string, string>,
  ): void {
    const key = this.shipmentKey(trackingNumber, carrierId);

    if (this.trackedShipments.has(key)) {
      logger.debug({ trackingNumber, carrierId }, 'Shipment already being tracked');
      return;
    }

    this.trackedShipments.set(key, {
      trackingNumber,
      carrierId,
      events: [],
      isActive: true,
      metadata,
    });

    logger.info({ trackingNumber, carrierId }, 'Shipment added to tracking');
  }

  /**
   * Removes a shipment from tracking.
   */
  untrackShipment(trackingNumber: string, carrierId: CarrierCode): void {
    const key = this.shipmentKey(trackingNumber, carrierId);
    const shipment = this.trackedShipments.get(key);

    if (shipment) {
      shipment.isActive = false;
      this.trackedShipments.delete(key);
      logger.info({ trackingNumber, carrierId }, 'Shipment removed from tracking');
    }
  }

  /**
   * Gets the current tracking status for a shipment.
   */
  async getStatus(
    trackingNumber: string,
    carrierId: CarrierCode,
  ): Promise<TrackingStatus> {
    const provider = this.providers.get(carrierId);
    if (!provider) {
      throw new Error(`No provider available for carrier: ${carrierId}`);
    }

    const status = await provider.getTrackingStatus(trackingNumber);

    // Update local state if we're tracking this shipment
    const key = this.shipmentKey(trackingNumber, carrierId);
    const tracked = this.trackedShipments.get(key);
    if (tracked) {
      this.processStatusUpdate(tracked, status);
    }

    return status;
  }

  /**
   * Gets the full tracking timeline for a shipment.
   */
  async getTimeline(
    trackingNumber: string,
    carrierId: CarrierCode,
  ): Promise<TrackingEvent[]> {
    const status = await this.getStatus(trackingNumber, carrierId);
    return status.events.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  /**
   * Polls all active shipments for tracking updates.
   */
  private async pollAllShipments(): Promise<void> {
    const activeShipments = Array.from(this.trackedShipments.values()).filter(
      (s) => s.isActive,
    );

    if (activeShipments.length === 0) {
      logger.debug('No active shipments to poll');
      return;
    }

    logger.info(
      { count: activeShipments.length },
      'Polling tracking updates for active shipments',
    );

    // Process in batches of 10 to avoid overwhelming carrier APIs
    const batchSize = 10;
    for (let i = 0; i < activeShipments.length; i += batchSize) {
      const batch = activeShipments.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map((shipment) => this.pollSingleShipment(shipment)),
      );

      // Brief delay between batches to respect rate limits
      if (i + batchSize < activeShipments.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  /**
   * Polls a single shipment for updates.
   */
  private async pollSingleShipment(shipment: TrackedShipment): Promise<void> {
    try {
      const provider = this.providers.get(shipment.carrierId);
      if (!provider) {
        logger.error(
          { carrierId: shipment.carrierId },
          'No provider for carrier',
        );
        return;
      }

      const status = await provider.getTrackingStatus(shipment.trackingNumber);
      this.processStatusUpdate(shipment, status);
      shipment.lastCheckedAt = new Date();
    } catch (error) {
      logger.error(
        {
          trackingNumber: shipment.trackingNumber,
          carrierId: shipment.carrierId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to poll shipment tracking',
      );
    }
  }

  /**
   * Processes a tracking status update and emits events for changes.
   */
  private processStatusUpdate(
    shipment: TrackedShipment,
    status: TrackingStatus,
  ): void {
    const previousStatus = shipment.lastStatus;
    const currentStatus = status.currentStatus;

    // Check for new events
    const existingEventTimestamps = new Set(
      shipment.events.map((e) => e.timestamp.getTime()),
    );

    const newEvents = status.events.filter(
      (e) => !existingEventTimestamps.has(e.timestamp.getTime()),
    );

    if (newEvents.length > 0) {
      shipment.events.push(...newEvents);
      shipment.events.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );

      for (const event of newEvents) {
        this.emit('tracking:event', {
          trackingNumber: shipment.trackingNumber,
          carrierId: shipment.carrierId,
          event,
          metadata: shipment.metadata,
        });
      }
    }

    // Emit status change events
    if (previousStatus !== currentStatus) {
      shipment.lastStatus = currentStatus;

      const eventMap: Partial<Record<TrackingEventCode, string>> = {
        picked_up: 'shipment:picked_up',
        in_transit: 'shipment:in_transit',
        out_for_delivery: 'shipment:out_for_delivery',
        delivered: 'shipment:delivered',
        exception: 'shipment:exception',
        returned: 'shipment:returned',
      };

      const eventName = eventMap[currentStatus];
      if (eventName) {
        this.emit(eventName, {
          trackingNumber: shipment.trackingNumber,
          carrierId: shipment.carrierId,
          status,
          metadata: shipment.metadata,
        });

        logger.info(
          {
            trackingNumber: shipment.trackingNumber,
            previousStatus,
            currentStatus,
          },
          'Shipment status changed',
        );
      }

      // Auto-deactivate tracking for terminal states
      if (currentStatus === 'delivered' || currentStatus === 'returned') {
        shipment.isActive = false;
        logger.info(
          { trackingNumber: shipment.trackingNumber, finalStatus: currentStatus },
          'Shipment reached terminal state, deactivating tracking',
        );
      }
    }
  }

  /**
   * Gets stats about currently tracked shipments.
   */
  getStats(): {
    total: number;
    active: number;
    byStatus: Record<string, number>;
    byCarrier: Record<string, number>;
  } {
    const shipments = Array.from(this.trackedShipments.values());
    const byStatus: Record<string, number> = {};
    const byCarrier: Record<string, number> = {};

    for (const s of shipments) {
      const status = s.lastStatus || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
      byCarrier[s.carrierId] = (byCarrier[s.carrierId] || 0) + 1;
    }

    return {
      total: shipments.length,
      active: shipments.filter((s) => s.isActive).length,
      byStatus,
      byCarrier,
    };
  }

  private shipmentKey(trackingNumber: string, carrierId: CarrierCode): string {
    return `${carrierId}:${trackingNumber}`;
  }
}
