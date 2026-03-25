import pino from 'pino';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

export type CarrierCode = 'ups' | 'fedex' | 'usps' | 'dhl';

export interface Address {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface PackageDetails {
  weight: number; // lbs
  length: number; // inches
  width: number;
  height: number;
  description?: string;
  value?: number;
}

export interface LabelRequest {
  from: Address;
  to: Address;
  package: PackageDetails;
  serviceType?: string;
  isReturn: boolean;
  referenceNumber?: string;
}

export interface ShippingLabel {
  trackingNumber: string;
  carrierId: CarrierCode;
  labelUrl: string;
  labelFormat: 'PDF' | 'PNG' | 'ZPL';
  labelData: Buffer;
  estimatedDeliveryDate?: Date;
  cost: number;
  currency: string;
  serviceType: string;
}

export interface PickupRequest {
  carrierId: CarrierCode;
  address: Address;
  packageCount: number;
  totalWeight: number;
  pickupDate: Date;
  readyTime: string; // HH:mm
  closeTime: string; // HH:mm
  instructions?: string;
}

export interface PickupConfirmation {
  confirmationNumber: string;
  carrierId: CarrierCode;
  pickupDate: Date;
  estimatedWindow: { start: string; end: string };
}

export interface DropOffLocation {
  id: string;
  carrierId: CarrierCode;
  name: string;
  address: Address;
  distance: number; // miles
  hours: { day: string; open: string; close: string }[];
  services: string[];
  latitude: number;
  longitude: number;
}

export type TrackingEventCode =
  | 'created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned';

export interface TrackingEvent {
  timestamp: Date;
  status: TrackingEventCode;
  description: string;
  location?: string;
}

export interface TrackingStatus {
  trackingNumber: string;
  carrierId: CarrierCode;
  currentStatus: TrackingEventCode;
  estimatedDeliveryDate?: Date;
  events: TrackingEvent[];
  signedBy?: string;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export class CarrierError extends Error {
  constructor(
    message: string,
    public readonly carrierId: CarrierCode,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'CarrierError';
  }
}

export class CircuitBreakerOpenError extends CarrierError {
  constructor(carrierId: CarrierCode) {
    super(
      `Circuit breaker is open for carrier ${carrierId}. Requests are temporarily blocked.`,
      carrierId,
      'CIRCUIT_BREAKER_OPEN',
    );
    this.name = 'CircuitBreakerOpenError';
  }
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

export abstract class BaseCarrierProvider {
  abstract readonly carrierId: CarrierCode;
  abstract readonly name: string;

  protected logger: pino.Logger;
  protected httpClient: AxiosInstance;
  private circuitBreaker: CircuitBreakerState;

  constructor(baseURL: string) {
    this.logger = pino({ name: `carrier:${this.constructor.name}` });
    this.httpClient = axios.create({ baseURL, timeout: 30_000 });
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
    };
  }

  abstract createLabel(request: LabelRequest): Promise<ShippingLabel>;
  abstract schedulePickup(request: PickupRequest): Promise<PickupConfirmation>;
  abstract getDropOffLocations(
    zip: string,
    radius: number,
  ): Promise<DropOffLocation[]>;
  abstract getTrackingStatus(trackingNumber: string): Promise<TrackingStatus>;
  abstract cancelShipment(trackingNumber: string): Promise<boolean>;

  protected async makeRequest<T>(
    url: string,
    options: RequestOptions,
  ): Promise<T> {
    this.checkCircuitBreaker();

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * backoffMs * 0.3;
        const delayMs = backoffMs + jitter;

        this.logger.info(
          { attempt, delayMs, url },
          'Retrying request after backoff',
        );

        await this.sleep(delayMs);

        // Re-check circuit breaker before retry in case it opened during backoff
        this.checkCircuitBreaker();
      }

      try {
        const config: AxiosRequestConfig = {
          method: options.method,
          url,
          headers: options.headers,
          timeout: options.timeout ?? 30_000,
        };

        if (options.body !== undefined) {
          if (options.method === 'GET') {
            config.params = options.body;
          } else {
            config.data = options.body;
          }
        }

        this.logger.debug(
          { method: options.method, url, attempt },
          'Making HTTP request',
        );

        const response = await this.httpClient.request<T>(config);

        // Success: reset circuit breaker
        this.onRequestSuccess();

        this.logger.debug(
          { method: options.method, url, status: response.status },
          'Request succeeded',
        );

        return response.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;

        this.logger.warn(
          {
            method: options.method,
            url,
            attempt,
            statusCode,
            message: lastError.message,
          },
          'Request failed',
        );

        // Do not retry on client errors (4xx) except 408 (timeout) and 429 (rate limit)
        if (
          statusCode !== undefined &&
          statusCode >= 400 &&
          statusCode < 500 &&
          statusCode !== 408 &&
          statusCode !== 429
        ) {
          this.onRequestFailure();
          throw this.mapError(axiosError);
        }

        // For 429, respect Retry-After header if present
        if (statusCode === 429) {
          const retryAfter = axiosError.response?.headers?.['retry-after'];
          if (retryAfter && attempt < MAX_RETRIES) {
            const retryAfterMs = parseInt(retryAfter, 10) * 1000;
            if (!isNaN(retryAfterMs) && retryAfterMs > 0) {
              this.logger.info(
                { retryAfterMs, url },
                'Rate limited, waiting for Retry-After',
              );
              await this.sleep(Math.min(retryAfterMs, 60_000));
              continue;
            }
          }
        }

        // Record failure for circuit breaker on server errors and timeouts
        if (attempt === MAX_RETRIES) {
          this.onRequestFailure();
        }
      }
    }

    // All retries exhausted
    throw this.mapError(lastError);
  }

  private checkCircuitBreaker(): void {
    if (this.circuitBreaker.state === 'open') {
      const elapsed = Date.now() - this.circuitBreaker.lastFailureTime;

      if (elapsed >= CIRCUIT_BREAKER_COOLDOWN_MS) {
        this.logger.info(
          'Circuit breaker transitioning from open to half-open',
        );
        this.circuitBreaker.state = 'half-open';
      } else {
        throw new CircuitBreakerOpenError(this.carrierId);
      }
    }
  }

  private onRequestSuccess(): void {
    if (
      this.circuitBreaker.state === 'half-open' ||
      this.circuitBreaker.failures > 0
    ) {
      this.logger.info('Circuit breaker reset to closed');
    }
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.state = 'closed';
  }

  private onRequestFailure(): void {
    this.circuitBreaker.failures += 1;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.state === 'half-open') {
      this.logger.warn('Circuit breaker re-opening after half-open failure');
      this.circuitBreaker.state = 'open';
    } else if (
      this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD
    ) {
      this.logger.warn(
        { failures: this.circuitBreaker.failures },
        'Circuit breaker opening after consecutive failures',
      );
      this.circuitBreaker.state = 'open';
    }
  }

  private mapError(error: unknown): CarrierError {
    if (error instanceof CarrierError) {
      return error;
    }

    const axiosError = error as AxiosError<{ errors?: Array<{ message?: string; code?: string }> }>;

    if (axiosError.response) {
      const status = axiosError.response.status;
      const responseData = axiosError.response.data;
      const apiMessage =
        responseData?.errors?.[0]?.message ?? axiosError.message;
      const apiCode = responseData?.errors?.[0]?.code ?? `HTTP_${status}`;

      return new CarrierError(
        `Carrier API error: ${apiMessage}`,
        this.carrierId,
        apiCode,
        status,
        axiosError,
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new CarrierError(
        `Request timed out: ${axiosError.message}`,
        this.carrierId,
        'TIMEOUT',
        undefined,
        axiosError,
      );
    }

    if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
      return new CarrierError(
        `Connection failed: ${axiosError.message}`,
        this.carrierId,
        'CONNECTION_ERROR',
        undefined,
        axiosError,
      );
    }

    const genericError =
      error instanceof Error ? error : new Error(String(error));

    return new CarrierError(
      genericError.message,
      this.carrierId,
      'UNKNOWN_ERROR',
      undefined,
      genericError,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
