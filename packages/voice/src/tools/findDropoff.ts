import pino from 'pino';
import type { DropOffLocationType } from '@returnclaw/core';
import type { RealtimeTool } from '../realtime.js';

const logger = pino({ name: 'returnclaw-voice-tool-find-dropoff' });

export const findDropoffSchema: RealtimeTool = {
  type: 'function',
  name: 'findDropoff',
  description:
    'Find nearby drop-off locations for returning a package. Searches by ZIP code and optionally filters by carrier. Returns a list of locations with addresses, distances, hours, and supported services.',
  parameters: {
    type: 'object',
    properties: {
      zipCode: {
        type: 'string',
        description: 'The ZIP code to search near',
      },
      carrier: {
        type: 'string',
        enum: ['ups', 'fedex', 'usps', 'amazon'],
        description: 'Optional carrier to filter locations for (e.g., ups, fedex, usps, amazon)',
      },
      radius: {
        type: 'number',
        description: 'Search radius in miles (default: 5, max: 25)',
      },
    },
    required: ['zipCode'],
  },
};

interface FindDropoffArgs {
  zipCode: string;
  carrier?: string;
  radius?: number;
}

interface DropoffLocation {
  name: string;
  type: DropOffLocationType;
  address: string;
  distance: string;
  hours: string;
  services: string[];
}

interface FindDropoffResult {
  success: boolean;
  zipCode: string;
  carrier: string | null;
  radiusMiles: number;
  locations: DropoffLocation[];
  message: string;
}

/**
 * Sample drop-off location database. In production, this would query carrier APIs
 * (UPS Locator API, FedEx Location API, USPS Service Locator) and Google Maps
 * for geocoding and distance calculations.
 *
 * Locations are keyed by zip code prefix (first 3 digits) for basic geographic grouping.
 */
const LOCATION_DATABASE: Record<string, DropoffLocation[]> = {
  // Default locations returned when no specific zip prefix matches.
  // In production, this would be a real-time API call to carrier location services.
  default: [
    {
      name: 'The UPS Store',
      type: 'ups_store',
      address: '1234 Commerce Blvd, Suite 100',
      distance: '0.5 mi',
      hours: 'Mon-Fri 8:00 AM - 7:00 PM, Sat 9:00 AM - 5:00 PM',
      services: ['UPS Drop-off', 'Packaging Services', 'Print & Ship', 'Amazon Returns'],
    },
    {
      name: 'FedEx Office Print & Ship Center',
      type: 'fedex_office',
      address: '5678 Main Street',
      distance: '0.8 mi',
      hours: 'Mon-Fri 7:00 AM - 9:00 PM, Sat-Sun 9:00 AM - 6:00 PM',
      services: ['FedEx Drop-off', 'Packaging Services', 'Printing', 'Scanning'],
    },
    {
      name: 'US Post Office',
      type: 'usps_office',
      address: '910 Federal Plaza',
      distance: '1.0 mi',
      hours: 'Mon-Fri 8:30 AM - 5:00 PM, Sat 9:00 AM - 1:00 PM',
      services: ['USPS Drop-off', 'Priority Mail', 'Certified Mail', 'PO Box'],
    },
    {
      name: 'Walgreens',
      type: 'walgreens',
      address: '2468 Oak Avenue',
      distance: '0.3 mi',
      hours: 'Mon-Sun 7:00 AM - 10:00 PM',
      services: ['FedEx Drop-off'],
    },
    {
      name: "Kohl's",
      type: 'kohls',
      address: '1357 Shopping Center Drive',
      distance: '1.2 mi',
      hours: 'Mon-Sat 9:00 AM - 9:00 PM, Sun 10:00 AM - 8:00 PM',
      services: ['Amazon Returns', 'Free Packaging'],
    },
    {
      name: 'Whole Foods Market',
      type: 'whole_foods',
      address: '9876 Market Way',
      distance: '1.5 mi',
      hours: 'Mon-Sun 7:00 AM - 10:00 PM',
      services: ['Amazon Returns', 'No Box/Label Needed'],
    },
    {
      name: 'Amazon Locker - 7-Eleven',
      type: 'amazon_locker',
      address: '4321 Quick Stop Road',
      distance: '0.2 mi',
      hours: '24/7',
      services: ['Amazon Returns', 'Amazon Pickup'],
    },
    {
      name: 'Staples',
      type: 'staples',
      address: '6543 Business Park Drive',
      distance: '2.0 mi',
      hours: 'Mon-Fri 8:00 AM - 8:00 PM, Sat 9:00 AM - 6:00 PM, Sun 10:00 AM - 5:00 PM',
      services: ['UPS Drop-off', 'Print & Ship', 'Packaging Supplies'],
    },
  ],
};

/** Map carrier IDs to the drop-off location types they accept */
const CARRIER_LOCATION_TYPES: Record<string, Set<DropOffLocationType>> = {
  ups: new Set<DropOffLocationType>(['ups_store', 'staples']),
  fedex: new Set<DropOffLocationType>(['fedex_office', 'walgreens']),
  usps: new Set<DropOffLocationType>(['usps_office']),
  amazon: new Set<DropOffLocationType>(['whole_foods', 'kohls', 'amazon_locker', 'ups_store']),
};

function validateZipCode(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

function filterByCarrier(locations: DropoffLocation[], carrier: string): DropoffLocation[] {
  const acceptedTypes = CARRIER_LOCATION_TYPES[carrier.toLowerCase()];
  if (acceptedTypes == null) {
    return locations;
  }
  return locations.filter((loc) => acceptedTypes.has(loc.type));
}

function filterByRadius(locations: DropoffLocation[], radiusMiles: number): DropoffLocation[] {
  return locations.filter((loc) => {
    const distanceMatch = loc.distance.match(/^([\d.]+)/);
    if (distanceMatch == null) return true;
    const distance = parseFloat(distanceMatch[1]);
    return distance <= radiusMiles;
  });
}

function sortByDistance(locations: DropoffLocation[]): DropoffLocation[] {
  return [...locations].sort((a, b) => {
    const distA = parseFloat(a.distance.match(/^([\d.]+)/)?.[1] ?? '999');
    const distB = parseFloat(b.distance.match(/^([\d.]+)/)?.[1] ?? '999');
    return distA - distB;
  });
}

function formatLocationList(locations: DropoffLocation[]): string {
  return locations
    .map(
      (loc, i) =>
        `${i + 1}. ${loc.name} - ${loc.address} (${loc.distance} away)\n   Hours: ${loc.hours}\n   Services: ${loc.services.join(', ')}`,
    )
    .join('\n\n');
}

export async function execute(
  args: { zipCode: string; carrier?: string; radius?: number },
): Promise<FindDropoffResult> {
  const { zipCode, carrier, radius } = args;

  const effectiveRadius = Math.min(Math.max(radius ?? 5, 1), 25);

  logger.info({ zipCode, carrier, radius: effectiveRadius }, 'Finding drop-off locations');

  // Validate ZIP code
  if (!validateZipCode(zipCode)) {
    return {
      success: false,
      zipCode,
      carrier: carrier ?? null,
      radiusMiles: effectiveRadius,
      locations: [],
      message: `Invalid ZIP code: ${zipCode}. Please provide a valid 5-digit US ZIP code.`,
    };
  }

  // Look up locations by zip prefix, falling back to default
  const zipPrefix = zipCode.trim().slice(0, 3);
  const allLocations = LOCATION_DATABASE[zipPrefix] ?? LOCATION_DATABASE['default'] ?? [];

  // Apply filters
  let filtered = [...allLocations];

  if (carrier != null && carrier.length > 0) {
    filtered = filterByCarrier(filtered, carrier);
  }

  filtered = filterByRadius(filtered, effectiveRadius);
  filtered = sortByDistance(filtered);

  if (filtered.length === 0) {
    const carrierLabel = carrier != null ? ` ${carrier.toUpperCase()}` : '';
    return {
      success: false,
      zipCode,
      carrier: carrier ?? null,
      radiusMiles: effectiveRadius,
      locations: [],
      message: `I couldn't find any${carrierLabel} drop-off locations within ${effectiveRadius} miles of ${zipCode}. ${
        carrier != null
          ? `Would you like me to search for a different carrier, or expand the search radius?`
          : `Would you like me to expand the search radius, or I can schedule a home pickup instead?`
      }`,
    };
  }

  const formattedList = formatLocationList(filtered);
  const carrierLabel = carrier != null ? `${carrier.toUpperCase()} ` : '';
  const closestLocation = filtered[0];

  logger.info(
    { zipCode, carrier, count: filtered.length },
    'Drop-off locations found',
  );

  return {
    success: true,
    zipCode,
    carrier: carrier ?? null,
    radiusMiles: effectiveRadius,
    locations: filtered,
    message: `I found ${filtered.length} ${carrierLabel}drop-off location${filtered.length !== 1 ? 's' : ''} near ${zipCode}. The closest is ${closestLocation!.name} at ${closestLocation!.distance} away. Here are your options:\n\n${formattedList}\n\nWould you like directions to any of these, or should I schedule a home pickup instead?`,
  };
}
