import { v4 as uuid } from 'uuid';
import pino from 'pino';
import type { Address, PickupRequest, PickupStatus, CarrierCode } from '@returnclaw/core';
import type { RealtimeTool } from '../realtime.js';

const logger = pino({ name: 'returnclaw-voice-tool-schedule-pickup' });

export const schedulePickupSchema: RealtimeTool = {
  type: 'function',
  name: 'schedulePickup',
  description:
    'Schedule a carrier pickup for a return package. The carrier will come to the specified address to collect the package. Ask the user for their preferred date and time window first.',
  parameters: {
    type: 'object',
    properties: {
      carrierId: {
        type: 'string',
        enum: ['ups', 'fedex', 'usps', 'dhl'],
        description: 'The carrier to schedule the pickup with',
      },
      address: {
        type: 'object',
        properties: {
          street1: { type: 'string', description: 'Street address line 1' },
          street2: { type: 'string', description: 'Street address line 2 (apt, suite, etc.)' },
          city: { type: 'string', description: 'City name' },
          state: { type: 'string', description: 'State abbreviation (e.g., CA, NY)' },
          zip: { type: 'string', description: 'ZIP code' },
          country: { type: 'string', description: 'Country code (default: US)' },
        },
        required: ['street1', 'city', 'state', 'zip'],
        description: 'The pickup address',
      },
      date: {
        type: 'string',
        description: 'Preferred pickup date in ISO format (YYYY-MM-DD). Must be a future date.',
      },
      timeWindow: {
        type: 'string',
        enum: ['morning', 'afternoon', 'evening'],
        description: 'Preferred time window for the pickup',
      },
    },
    required: ['carrierId', 'address', 'date', 'timeWindow'],
  },
};

interface SchedulePickupArgs {
  carrierId: string;
  address: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
  };
  date: string;
  timeWindow: string;
}

interface SchedulePickupResult {
  success: boolean;
  pickupRequest: Partial<PickupRequest> | null;
  confirmationNumber: string | null;
  message: string;
}

const TIME_WINDOW_MAP: Record<string, { start: string; end: string; display: string }> = {
  morning: { start: '08:00', end: '12:00', display: '8:00 AM - 12:00 PM' },
  afternoon: { start: '12:00', end: '17:00', display: '12:00 PM - 5:00 PM' },
  evening: { start: '17:00', end: '20:00', display: '5:00 PM - 8:00 PM' },
};

const CARRIER_PICKUP_SUPPORT: Record<string, { supported: boolean; name: string; note: string }> = {
  ups: {
    supported: true,
    name: 'UPS',
    note: 'UPS offers same-day pickup if scheduled before 3 PM local time',
  },
  fedex: {
    supported: true,
    name: 'FedEx',
    note: 'FedEx pickups are available Monday through Friday',
  },
  usps: {
    supported: false,
    name: 'USPS',
    note: 'USPS does not offer scheduled pickups for return packages. Please use a USPS drop-off location instead.',
  },
  dhl: {
    supported: true,
    name: 'DHL',
    note: 'DHL offers pickup services in select metro areas',
  },
};

function validateAddress(address: SchedulePickupArgs['address']): string | null {
  if (address.street1.trim().length === 0) {
    return 'Street address is required';
  }
  if (address.city.trim().length === 0) {
    return 'City is required';
  }
  if (address.state.trim().length === 0) {
    return 'State is required';
  }
  if (address.zip.trim().length === 0) {
    return 'ZIP code is required';
  }

  // Basic ZIP code validation (US format)
  const zipPattern = /^\d{5}(-\d{4})?$/;
  if (!zipPattern.test(address.zip.trim())) {
    return `Invalid ZIP code format: ${address.zip}. Expected 5-digit or 5+4 format (e.g., 90210 or 90210-1234)`;
  }

  // Basic state abbreviation validation
  const validStates = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
  ]);
  if (!validStates.has(address.state.toUpperCase().trim())) {
    return `Invalid state abbreviation: ${address.state}`;
  }

  return null;
}

function validateDate(dateStr: string): { valid: boolean; error?: string; date?: Date } {
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return { valid: false, error: `Invalid date format: ${dateStr}. Use YYYY-MM-DD.` };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (parsed < today) {
    return { valid: false, error: 'Pickup date must be today or a future date.' };
  }

  // Check not more than 14 days in the future
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 14);
  if (parsed > maxDate) {
    return { valid: false, error: 'Pickup date must be within the next 14 days.' };
  }

  // Check not a Sunday (most carriers don't pick up on Sundays)
  if (parsed.getDay() === 0) {
    return { valid: false, error: 'Pickups are not available on Sundays. Please choose a weekday or Saturday.' };
  }

  return { valid: true, date: parsed };
}

export async function execute(
  args: { carrierId: string; address: object; date: string; timeWindow: string },
): Promise<SchedulePickupResult> {
  const typedArgs: SchedulePickupArgs = {
    carrierId: args.carrierId,
    address: args.address as SchedulePickupArgs['address'],
    date: args.date,
    timeWindow: args.timeWindow,
  };

  const { carrierId, address, date, timeWindow } = typedArgs;

  logger.info({ carrierId, date, timeWindow }, 'Scheduling carrier pickup');

  // Validate carrier supports pickup
  const carrierInfo = CARRIER_PICKUP_SUPPORT[carrierId.toLowerCase()];
  if (carrierInfo == null) {
    return {
      success: false,
      pickupRequest: null,
      confirmationNumber: null,
      message: `Unknown carrier: ${carrierId}. Supported carriers are UPS, FedEx, USPS, and DHL.`,
    };
  }

  if (!carrierInfo.supported) {
    return {
      success: false,
      pickupRequest: null,
      confirmationNumber: null,
      message: `${carrierInfo.name} does not offer scheduled pickups for return packages. Would you like me to find a nearby ${carrierInfo.name} drop-off location instead?`,
    };
  }

  // Validate address
  const addressError = validateAddress(address);
  if (addressError != null) {
    return {
      success: false,
      pickupRequest: null,
      confirmationNumber: null,
      message: `There's an issue with the address: ${addressError}. Could you provide the correct address?`,
    };
  }

  // Validate date
  const dateValidation = validateDate(date);
  if (!dateValidation.valid) {
    return {
      success: false,
      pickupRequest: null,
      confirmationNumber: null,
      message: dateValidation.error ?? 'Invalid pickup date.',
    };
  }

  // Validate time window
  const windowInfo = TIME_WINDOW_MAP[timeWindow.toLowerCase()];
  if (windowInfo == null) {
    return {
      success: false,
      pickupRequest: null,
      confirmationNumber: null,
      message: `Invalid time window: ${timeWindow}. Choose from morning (8AM-12PM), afternoon (12PM-5PM), or evening (5PM-8PM).`,
    };
  }

  // In production, this would call the carrier's pickup scheduling API
  const confirmationNumber = `PU-${uuid().slice(0, 8).toUpperCase()}`;
  const pickupId = uuid();

  const pickupAddress: Address = {
    street1: address.street1.trim(),
    street2: address.street2?.trim(),
    city: address.city.trim(),
    state: address.state.toUpperCase().trim(),
    zip: address.zip.trim(),
    country: address.country?.trim() ?? 'US',
  };

  const pickupRequest: Partial<PickupRequest> = {
    id: pickupId,
    carrierId: carrierId.toLowerCase() as CarrierCode,
    scheduledDate: dateValidation.date,
    timeWindow: {
      start: windowInfo.start,
      end: windowInfo.end,
    },
    address: pickupAddress,
    status: 'scheduled' as PickupStatus,
    confirmationNumber,
  };

  const formattedAddress = [
    pickupAddress.street1,
    pickupAddress.street2,
    `${pickupAddress.city}, ${pickupAddress.state} ${pickupAddress.zip}`,
  ]
    .filter(Boolean)
    .join(', ');

  logger.info(
    { pickupId, carrierId, confirmationNumber, date, timeWindow: windowInfo.display },
    'Pickup scheduled successfully',
  );

  return {
    success: true,
    pickupRequest,
    confirmationNumber,
    message: `Your ${carrierInfo.name} pickup is scheduled for ${date} between ${windowInfo.display} at ${formattedAddress}. Your confirmation number is ${confirmationNumber}. Just leave the package somewhere visible near your door before the pickup window. ${carrierInfo.note}`,
  };
}
