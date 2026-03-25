import pino from 'pino';
import {
  CarrierCode,
  BaseCarrierProvider,
  LabelRequest,
  ShippingLabel,
  PickupRequest,
  PickupConfirmation,
  TrackingStatus,
  DropOffLocation,
  Address,
} from './providers/base';
import { LabelGenerator } from './labels/generator';
import { LabelStorage } from './labels/storage';
import { PickupScheduler } from './pickup/scheduler';
import { ShipmentTracker } from './tracking/tracker';
import { CarrierWebhookHandler, WebhookConfig, WebhookPayload } from './tracking/webhook';
import { DropOffLocator, EnrichedDropOffLocation, DropOffSearchOptions } from './dropoff/locator';
import { CarrierSelector, CarrierOption, SelectionCriteria } from './optimizer/selector';

const logger = pino({ name: 'carriers:manager' });

export interface CarrierManagerConfig {
  s3Bucket: string;
  s3Region: string;
  webhookConfig?: WebhookConfig;
}

/**
 * CarrierManager — facade for all carrier operations.
 * Provides a unified interface for label generation, pickup scheduling,
 * tracking, drop-off location lookup, and carrier selection.
 */
export class CarrierManager {
  private readonly providers: Map<CarrierCode, BaseCarrierProvider>;
  private readonly labelGenerator: LabelGenerator;
  private readonly labelStorage: LabelStorage;
  private readonly pickupScheduler: PickupScheduler;
  private readonly tracker: ShipmentTracker;
  private readonly webhookHandler: CarrierWebhookHandler;
  private readonly dropOffLocator: DropOffLocator;
  private readonly carrierSelector: CarrierSelector;

  constructor(
    providers: Map<CarrierCode, BaseCarrierProvider>,
    config: CarrierManagerConfig,
  ) {
    this.providers = providers;
    this.labelStorage = new LabelStorage(config.s3Bucket, config.s3Region);
    this.labelGenerator = new LabelGenerator(providers, this.labelStorage);
    this.pickupScheduler = new PickupScheduler(providers);
    this.tracker = new ShipmentTracker(providers);
    this.webhookHandler = new CarrierWebhookHandler(config.webhookConfig || {});
    this.dropOffLocator = new DropOffLocator(providers);
    this.carrierSelector = new CarrierSelector(providers, this.dropOffLocator);

    logger.info(
      { carriers: Array.from(providers.keys()) },
      'CarrierManager initialized',
    );
  }

  // ─── Label Generation ────────────────────────────────────────────────

  /**
   * Generates a shipping label with the specified carrier.
   * Stores the label in S3 and generates a QR code for mobile drop-off.
   */
  async generateLabel(
    request: LabelRequest,
    carrierId?: CarrierCode,
  ): Promise<ShippingLabel & { storedUrl: string; qrCodeUrl: string }> {
    const targetCarrier = carrierId || this.resolveDefaultCarrier(request);
    logger.info(
      {
        carrier: targetCarrier,
        from: request.from.zip,
        to: request.to.zip,
        isReturn: request.isReturn,
      },
      'Generating shipping label',
    );

    const label = await this.labelGenerator.generateLabel(request, targetCarrier);

    // Automatically track the new shipment
    this.tracker.trackShipment(label.trackingNumber, targetCarrier);

    return label;
  }

  /**
   * Generates a return label by swapping the from/to addresses.
   */
  async generateReturnLabel(
    originalFrom: Address,
    originalTo: Address,
    pkg: LabelRequest['package'],
    carrierId?: CarrierCode,
  ): Promise<ShippingLabel & { storedUrl: string; qrCodeUrl: string }> {
    const returnRequest: LabelRequest = {
      from: originalTo,    // Customer sends from their address
      to: originalFrom,    // Back to the retailer
      package: pkg,
      isReturn: true,
    };

    return this.generateLabel(returnRequest, carrierId);
  }

  // ─── Pickup Scheduling ───────────────────────────────────────────────

  /**
   * Schedules a carrier pickup at the specified address.
   */
  async schedulePickup(request: PickupRequest): Promise<PickupConfirmation> {
    logger.info(
      {
        carrier: request.carrierId,
        date: request.pickupDate,
        zip: request.address.zip,
      },
      'Scheduling pickup',
    );

    return this.pickupScheduler.schedulePickup(
      request.carrierId,
      request.address,
      request.packageCount,
      request.totalWeight,
      request.pickupDate,
      request.readyTime,
      request.closeTime,
      request.instructions,
    );
  }

  /**
   * Cancels a previously scheduled pickup.
   */
  async cancelPickup(
    confirmationNumber: string,
    carrierId: CarrierCode,
  ): Promise<boolean> {
    const result = await this.pickupScheduler.cancelPickup(confirmationNumber, carrierId);
    return result.cancelled;
  }

  // ─── Drop-off Locations ──────────────────────────────────────────────

  /**
   * Finds drop-off locations near an address.
   */
  async findDropOffLocations(
    address: Address,
    carrierId?: CarrierCode,
  ): Promise<EnrichedDropOffLocation[]> {
    const options: DropOffSearchOptions = {
      zip: address.zip,
      country: address.country,
      carrierIds: carrierId ? [carrierId] : undefined,
    };

    return this.dropOffLocator.findLocations(options);
  }

  /**
   * Finds the nearest drop-off location for a specific carrier.
   */
  async findNearestDropOff(
    zip: string,
    carrierId: CarrierCode,
  ): Promise<EnrichedDropOffLocation | null> {
    return this.dropOffLocator.findNearest(zip, carrierId);
  }

  // ─── Tracking ────────────────────────────────────────────────────────

  /**
   * Gets the current tracking status for a shipment.
   */
  async trackShipment(
    trackingNumber: string,
    carrierId: CarrierCode,
  ): Promise<TrackingStatus> {
    return this.tracker.getStatus(trackingNumber, carrierId);
  }

  /**
   * Starts background tracking polling for all watched shipments.
   */
  startTrackingPolling(cronExpression?: string): void {
    this.tracker.startPolling(cronExpression);
  }

  /**
   * Stops background tracking polling.
   */
  stopTrackingPolling(): void {
    this.tracker.stopPolling();
  }

  /**
   * Adds a shipment to the active tracking watch list.
   */
  watchShipment(
    trackingNumber: string,
    carrierId: CarrierCode,
    metadata?: Record<string, string>,
  ): void {
    this.tracker.trackShipment(trackingNumber, carrierId, metadata);
  }

  // ─── Webhooks ────────────────────────────────────────────────────────

  /**
   * Processes an incoming carrier webhook.
   */
  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const event = await this.webhookHandler.handleWebhook(payload);
    if (event) {
      logger.info(
        {
          trackingNumber: event.trackingNumber,
          carrier: event.carrierId,
          status: event.status,
        },
        'Webhook processed',
      );
    }
  }

  // ─── Carrier Selection ───────────────────────────────────────────────

  /**
   * Selects the optimal carrier based on various criteria.
   * Returns a ranked list of options.
   */
  async selectCarrier(criteria: SelectionCriteria): Promise<CarrierOption[]> {
    return this.carrierSelector.selectCarrier(criteria);
  }

  /**
   * Gets the cheapest carrier option for a given label request.
   */
  async getCheapestOption(
    labelRequest: LabelRequest,
    userZip?: string,
  ): Promise<CarrierOption> {
    const options = await this.carrierSelector.selectCarrier({
      labelRequest,
      optimizeFor: 'cost',
      userZip,
    });

    return options[0];
  }

  /**
   * Gets the fastest carrier option for a given label request.
   */
  async getFastestOption(
    labelRequest: LabelRequest,
    userZip?: string,
  ): Promise<CarrierOption> {
    const options = await this.carrierSelector.selectCarrier({
      labelRequest,
      optimizeFor: 'speed',
      userZip,
    });

    return options[0];
  }

  // ─── Utility ─────────────────────────────────────────────────────────

  /**
   * Cancels a shipment by tracking number.
   */
  async cancelShipment(
    trackingNumber: string,
    carrierId: CarrierCode,
  ): Promise<boolean> {
    const provider = this.providers.get(carrierId);
    if (!provider) {
      throw new Error(`No provider available for carrier: ${carrierId}`);
    }

    const cancelled = await provider.cancelShipment(trackingNumber);
    if (cancelled) {
      this.tracker.untrackShipment(trackingNumber, carrierId);
    }
    return cancelled;
  }

  /**
   * Gets the list of available carriers.
   */
  getAvailableCarriers(): CarrierCode[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Event subscription for tracking updates.
   */
  onTrackingUpdate(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void {
    this.tracker.on(event, listener);
  }

  /**
   * Event subscription for pickup events.
   */
  onPickupEvent(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void {
    this.pickupScheduler.on(event, listener);
  }

  /**
   * Resolves the default carrier for a request when none is specified.
   * Prefers USPS for domestic, DHL for international.
   */
  private resolveDefaultCarrier(request: LabelRequest): CarrierCode {
    const isDomestic = request.from.country === request.to.country;

    if (!isDomestic && this.providers.has('dhl')) {
      return 'dhl';
    }

    // Prefer USPS for domestic returns (free pickup)
    if (request.isReturn && this.providers.has('usps')) {
      return 'usps';
    }

    // Default to UPS for domestic
    if (this.providers.has('ups')) {
      return 'ups';
    }

    // Return first available
    const firstCarrier = this.providers.keys().next().value;
    if (!firstCarrier) {
      throw new Error('No carrier providers configured');
    }
    return firstCarrier;
  }
}
