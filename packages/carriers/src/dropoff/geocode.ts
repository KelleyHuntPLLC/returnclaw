import axios from 'axios';
import pino from 'pino';

const logger = pino({ name: 'carriers:geocode' });

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodedAddress {
  formattedAddress: string;
  coordinates: GeoCoordinates;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const GEOCODE_API_URL = process.env.GEOCODE_API_URL || 'https://maps.googleapis.com/maps/api/geocode/json';
const GEOCODE_API_KEY = process.env.GEOCODE_API_KEY || '';

// Simple in-memory geocode cache
const geocodeCache = new Map<string, GeocodedAddress>();
const MAX_CACHE_SIZE = 10000;

/**
 * Geocodes a zip code to latitude/longitude coordinates.
 */
export async function geocodeZip(zip: string, country: string = 'US'): Promise<GeoCoordinates | null> {
  const cacheKey = `zip:${zip}:${country}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    return cached.coordinates;
  }

  try {
    const response = await axios.get(GEOCODE_API_URL, {
      params: {
        address: `${zip}, ${country}`,
        key: GEOCODE_API_KEY,
      },
      timeout: 5000,
    });

    if (response.data.results?.length > 0) {
      const result = response.data.results[0];
      const location = result.geometry.location;
      const coordinates: GeoCoordinates = {
        latitude: location.lat,
        longitude: location.lng,
      };

      const geocoded: GeocodedAddress = {
        formattedAddress: result.formatted_address,
        coordinates,
        city: extractComponent(result.address_components, 'locality'),
        state: extractComponent(result.address_components, 'administrative_area_level_1'),
        zip,
        country,
      };

      // Cache the result
      if (geocodeCache.size >= MAX_CACHE_SIZE) {
        const firstKey = geocodeCache.keys().next().value;
        if (firstKey) geocodeCache.delete(firstKey);
      }
      geocodeCache.set(cacheKey, geocoded);

      return coordinates;
    }

    logger.warn({ zip, country }, 'No geocode results found');
    return null;
  } catch (error) {
    logger.error(
      { zip, country, error: error instanceof Error ? error.message : String(error) },
      'Geocoding failed',
    );
    return null;
  }
}

/**
 * Geocodes a full address string.
 */
export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  const cacheKey = `addr:${address}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await axios.get(GEOCODE_API_URL, {
      params: {
        address,
        key: GEOCODE_API_KEY,
      },
      timeout: 5000,
    });

    if (response.data.results?.length > 0) {
      const result = response.data.results[0];
      const location = result.geometry.location;

      const geocoded: GeocodedAddress = {
        formattedAddress: result.formatted_address,
        coordinates: {
          latitude: location.lat,
          longitude: location.lng,
        },
        city: extractComponent(result.address_components, 'locality'),
        state: extractComponent(result.address_components, 'administrative_area_level_1'),
        zip: extractComponent(result.address_components, 'postal_code'),
        country: extractComponent(result.address_components, 'country'),
      };

      if (geocodeCache.size >= MAX_CACHE_SIZE) {
        const firstKey = geocodeCache.keys().next().value;
        if (firstKey) geocodeCache.delete(firstKey);
      }
      geocodeCache.set(cacheKey, geocoded);

      return geocoded;
    }

    logger.warn({ address }, 'No geocode results found');
    return null;
  } catch (error) {
    logger.error(
      { address, error: error instanceof Error ? error.message : String(error) },
      'Geocoding failed',
    );
    return null;
  }
}

/**
 * Calculates the distance between two points in miles using the Haversine formula.
 */
export function calculateDistanceMiles(
  point1: GeoCoordinates,
  point2: GeoCoordinates,
): number {
  const EARTH_RADIUS_MILES = 3959;

  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLng = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_MILES * c * 100) / 100;
}

/**
 * Sorts locations by distance from a reference point.
 */
export function sortByDistance<T extends { latitude: number; longitude: number }>(
  locations: T[],
  from: GeoCoordinates,
): (T & { distance: number })[] {
  return locations
    .map((loc) => ({
      ...loc,
      distance: calculateDistanceMiles(from, {
        latitude: loc.latitude,
        longitude: loc.longitude,
      }),
    }))
    .sort((a, b) => a.distance - b.distance);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function extractComponent(
  components: Array<{ types: string[]; long_name: string; short_name: string }>,
  type: string,
): string {
  const component = components?.find((c: { types: string[] }) => c.types.includes(type));
  return component?.long_name || '';
}
