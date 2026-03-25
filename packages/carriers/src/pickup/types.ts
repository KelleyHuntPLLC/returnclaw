import { CarrierCode, Address } from '../providers/base';

export interface PickupWindow {
  date: Date;
  readyTime: string;  // HH:mm format
  closeTime: string;   // HH:mm format
}

export interface PickupAvailability {
  carrierId: CarrierCode;
  available: boolean;
  windows: PickupWindow[];
  cutoffTime?: string;
  fees: {
    sameDayFee: number;
    nextDayFee: number;
    currency: string;
  };
}

export interface PickupCancellation {
  confirmationNumber: string;
  carrierId: CarrierCode;
  cancelled: boolean;
  reason?: string;
}

export interface ScheduledPickup {
  confirmationNumber: string;
  carrierId: CarrierCode;
  address: Address;
  scheduledDate: Date;
  window: { start: string; end: string };
  packageCount: number;
  status: 'scheduled' | 'picked_up' | 'cancelled' | 'failed';
  createdAt: Date;
}
