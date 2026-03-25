export interface Carrier {
  id: string;
  name: string;
  code: CarrierCode;
  apiAvailable: boolean;
  services: CarrierService[];
  dropOffLocations: DropOffLocationType[];
  pickupAvailable: boolean;
}

export enum CarrierCode {
  UPS = 'ups',
  FEDEX = 'fedex',
  USPS = 'usps',
  DHL = 'dhl',
  AMAZON_LOGISTICS = 'amazon_logistics',
}

export interface CarrierService {
  code: string;
  name: string;
  estimatedDays: number;
  priceRange: { min: number; max: number };
}

export interface ShippingLabel {
  id: string;
  returnRequestId: string;
  carrierId: CarrierCode;
  trackingNumber: string;
  labelUrl: string;
  labelFormat: 'pdf' | 'png' | 'zpl';
  expiresAt: Date;
  createdAt: Date;
}

export interface PickupRequest {
  id: string;
  returnRequestId: string;
  carrierId: CarrierCode;
  scheduledDate: Date;
  timeWindow: { start: string; end: string };
  address: Address;
  status: PickupStatus;
  confirmationNumber?: string;
}

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export enum PickupStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export type DropOffLocationType =
  | 'ups_store'
  | 'fedex_office'
  | 'usps_office'
  | 'walgreens'
  | 'kohls'
  | 'whole_foods'
  | 'amazon_locker'
  | 'staples';
