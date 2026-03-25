import pino from 'pino';
import {
  CarrierCode,
  BaseCarrierProvider,
  DropOffLocation,
  Address,
} from '../providers/base';
import { geocodeZip, calculateDistanceMiles, GeoCoordinates } from './geocode';

const logger = pino({ name: 'carriers:dropoff-locator' });

export interface DropOffSearchOptions {
  /** Zip code to search near */
  zip: string;
  /** Country code, default US */
  country?: string;
  /** Search radius in miles, default 10 */
  radiusMiles?: number;
  /** Maximum number of results to return */
  maxResults?: number;
  /** Filter to specific carriers */
  carrierIds?: CarrierCode[];
  /** Filter by required services (e.g., 'label_printing', 'package_dropoff') */
  requiredServices?: string[];
  /** Sort by: 'distance' (default), 'hours' (open latest), 'services' (most services) */
  sortBy?: 'distance' | 'hours' | 'services';
}

export interface EnrichedDropOffLocation extends DropOffLocation {
  isOpen: boolean;
  closesAt?: string;
  carrierName: string;
}

const CARRIER_NAMES: Record<CarrierCode, string> = {
  ups: 'UPS',
  fedex: 'FedEx',
  usps: 'USPS',
  dhl: 'DHL',
};

export class DropOffLocator {
  private readonly providers: Map<CarrierCode, BaseCarrierProvider>;

  constructor(providers: Map<CarrierCode, BaseCarrierProvider>) {
    this.providers = providers;
  }

  /**
   * Finds nearby drop-off locations across all or specific carriers.
   */
  async findLocations(options: DropOffSearchOptions): Promise<EnrichedDropOffLocation[]> {
    const {
      zip,
      country = 'US',
      radiusMiles = 10,
      maxResults = 20,
      carrierIds,
      requiredServices,
      sortBy = 'distance',
    } = options;

    // Geocode the search zip for distance calculations
    const searchCoordinates = await geocodeZip(zip, country);
    if (!searchCoordinates) {
      logger.warn({ zip }, 'Could not geocode search zip code');
      // Still proceed — carrier APIs can search by zip directly
    }

    // Determine which carriers to query
    const carriersToQuery = carrierIds
      ? carrierIds.filter((id) => this.providers.has(id))
      : Array.from(this.providers.keys());

    if (carriersToQuery.length === 0) {
      logger.warn('No carrier providers available for drop-off location search');
      return [];
    }

    // Query all carriers in parallel
    const results = await Promise.allSettled(
      carriersToQuery.map((carrierId) =>
        this.queryCarrier(carrierId, zip, radiusMiles),
      ),
    );

    // Collect all locations
    let allLocations: EnrichedDropOffLocation[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const carrierId = carriersToQuery[i];

      if (result.status === 'fulfilled') {
        const enriched = result.value.map((loc) =>
          this.enrichLocation(loc, searchCoordinates),
        );
        allLocations.push(...enriched);
      } else {
        logger.error(
          { carrierId, error: result.reason },
          'Failed to query carrier for drop-off locations',
        );
      }
    }

    // Filter by required services
    if (requiredServices && requiredServices.length > 0) {
      allLocations = allLocations.filter((loc) =>
        requiredServices.every((svc) => loc.services.includes(svc)),
      );
    }

    // Recalculate distances if we have search coordinates
    if (searchCoordinates) {
      for (const loc of allLocations) {
        loc.distance = calculateDistanceMiles(searchCoordinates, {
          latitude: loc.latitude,
          longitude: loc.longitude,
        });
      }
    }

    // Sort
    allLocations = this.sortLocations(allLocations, sortBy);

    // Limit results
    return allLocations.slice(0, maxResults);
  }

  /**
   * Finds the single nearest drop-off location for a specific carrier.
   */
  async findNearest(
    zip: string,
    carrierId: CarrierCode,
  ): Promise<EnrichedDropOffLocation | null> {
    const locations = await this.findLocations({
      zip,
      carrierIds: [carrierId],
      maxResults: 1,
      sortBy: 'distance',
    });

    return locations[0] || null;
  }

  /**
   * Finds the nearest location across ALL carriers.
   */
  async findNearestAny(zip: string): Promise<EnrichedDropOffLocation | null> {
    const locations = await this.findLocations({
      zip,
      maxResults: 1,
      sortBy: 'distance',
    });

    return locations[0] || null;
  }

  /**
   * Gets the best drop-off option for each carrier.
   */
  async findBestPerCarrier(
    zip: string,
    radiusMiles: number = 10,
  ): Promise<Map<CarrierCode, EnrichedDropOffLocation>> {
    const allLocations = await this.findLocations({
      zip,
      radiusMiles,
      maxResults: 100,
      sortBy: 'distance',
    });

    const bestPerCarrier = new Map<CarrierCode, EnrichedDropOffLocation>();
    for (const loc of allLocations) {
      if (!bestPerCarrier.has(loc.carrierId)) {
        bestPerCarrier.set(loc.carrierId, loc);
      }
    }

    return bestPerCarrier;
  }

  /**
   * Queries a single carrier for drop-off locations.
   */
  private async queryCarrier(
    carrierId: CarrierCode,
    zip: string,
    radiusMiles: number,
  ): Promise<DropOffLocation[]> {
    const provider = this.providers.get(carrierId);
    if (!provider) {
      return [];
    }

    try {
      const locations = await provider.getDropOffLocations(zip, radiusMiles);
      return locations;
    } catch (error) {
      logger.error(
        { carrierId, zip, error: error instanceof Error ? error.message : String(error) },
        'Carrier drop-off location query failed',
      );
      return [];
    }
  }

  /**
   * Enriches a drop-off location with additional computed fields.
   */
  private enrichLocation(
    location: DropOffLocation,
    searchCoordinates: GeoCoordinates | null,
  ): EnrichedDropOffLocation {
    const now = new Date();
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

    // Find today's hours
    const todayHours = location.hours.find(
      (h) => h.day.toLowerCase() === dayOfWeek.toLowerCase(),
    );

    let isOpen = false;
    let closesAt: string | undefined;

    if (todayHours && todayHours.open !== 'Closed') {
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      isOpen = currentTime >= todayHours.open && currentTime < todayHours.close;
      if (isOpen) {
        closesAt = todayHours.close;
      }
    }

    // Recalculate distance if we have coordinates
    let distance = location.distance;
    if (searchCoordinates && location.latitude && location.longitude) {
      distance = calculateDistanceMiles(searchCoordinates, {
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }

    return {
      ...location,
      distance,
      isOpen,
      closesAt,
      carrierName: CARRIER_NAMES[location.carrierId] || location.carrierId,
    };
  }

  /**
   * Sorts locations by the specified criteria.
   */
  private sortLocations(
    locations: EnrichedDropOffLocation[],
    sortBy: 'distance' | 'hours' | 'services',
  ): EnrichedDropOffLocation[] {
    switch (sortBy) {
      case 'distance':
        return locations.sort((a, b) => a.distance - b.distance);

      case 'hours':
        // Open locations first, then sorted by closing time (latest first)
        return locations.sort((a, b) => {
          if (a.isOpen && !b.isOpen) return -1;
          if (!a.isOpen && b.isOpen) return 1;
          if (a.closesAt && b.closesAt) {
            return b.closesAt.localeCompare(a.closesAt);
          }
          return a.distance - b.distance;
        });

      case 'services':
        // Most services first, then by distance
        return locations.sort((a, b) => {
          const servicesDiff = b.services.length - a.services.length;
          if (servicesDiff !== 0) return servicesDiff;
          return a.distance - b.distance;
        });

      default:
        return locations.sort((a, b) => a.distance - b.distance);
    }
  }
}
