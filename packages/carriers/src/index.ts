/**
 * ReturnClaw — Voice-first AI agent for consumer returns
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 * Source-available license. See LICENSE.md for terms.
 * https://kelleyhunt.law
 */
// ─── Core types ────────────────────────────────────────────────────────────
export {
  CarrierCode,
  Address,
  PackageDetails,
  LabelRequest,
  ShippingLabel,
  PickupRequest,
  PickupConfirmation,
  DropOffLocation,
  TrackingEventCode,
  TrackingEvent,
  TrackingStatus,
  RequestOptions,
  CarrierError,
  CircuitBreakerOpenError,
  BaseCarrierProvider,
} from './providers/base';

// ─── Carrier providers ─────────────────────────────────────────────────────
export { UPSProvider } from './providers/ups';
export { FedExProvider } from './providers/fedex';
export { USPSProvider } from './providers/usps';
export { DHLProvider } from './providers/dhl';

// ─── Manager (main facade) ─────────────────────────────────────────────────
export { CarrierManager, CarrierManagerConfig } from './manager';

// ─── Labels ────────────────────────────────────────────────────────────────
export { LabelGenerator } from './labels/generator';
export { LabelStorage } from './labels/storage';

// ─── Pickup ────────────────────────────────────────────────────────────────
export { PickupScheduler } from './pickup/scheduler';
export {
  PickupWindow,
  PickupAvailability,
  PickupCancellation,
  ScheduledPickup,
} from './pickup/types';

// ─── Tracking ──────────────────────────────────────────────────────────────
export { ShipmentTracker } from './tracking/tracker';
export { CarrierWebhookHandler, WebhookPayload, WebhookConfig } from './tracking/webhook';

// ─── Drop-off ──────────────────────────────────────────────────────────────
export {
  DropOffLocator,
  DropOffSearchOptions,
  EnrichedDropOffLocation,
} from './dropoff/locator';
export {
  geocodeZip,
  geocodeAddress,
  calculateDistanceMiles,
  sortByDistance,
  GeoCoordinates,
  GeocodedAddress,
} from './dropoff/geocode';

// ─── Optimizer ─────────────────────────────────────────────────────────────
export {
  CarrierSelector,
  CarrierOption,
  SelectionCriteria,
} from './optimizer/selector';
