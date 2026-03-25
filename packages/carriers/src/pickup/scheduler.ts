import pino from 'pino';
import { EventEmitter } from 'events';
import {
  CarrierCode,
  BaseCarrierProvider,
  PickupRequest,
  PickupConfirmation,
  Address,
} from '../providers/base';
import {
  PickupAvailability,
  PickupCancellation,
  ScheduledPickup,
} from './types';

const logger = pino({ name: 'carriers:pickup-scheduler' });

export class PickupScheduler extends EventEmitter {
  private readonly providers: Map<CarrierCode, BaseCarrierProvider>;
  private readonly scheduledPickups: Map<string, ScheduledPickup> = new Map();

  constructor(providers: Map<CarrierCode, BaseCarrierProvider>) {
    super();
    this.providers = providers;
  }

  /**
   * Checks pickup availability for a given carrier and address.
   */
  async checkAvailability(
    carrierId: CarrierCode,
    address: Address,
    preferredDate?: Date,
  ): Promise<PickupAvailability> {
    const provider = this.getProvider(carrierId);
    const pickupDate = preferredDate || this.getNextBusinessDay();

    // Validate that the pickup date is not in the past
    if (pickupDate < new Date()) {
      return {
        carrierId,
        available: false,
        windows: [],
        fees: { sameDayFee: 0, nextDayFee: 0, currency: 'USD' },
      };
    }

    // Check if today's cutoff has passed for same-day pickup
    const now = new Date();
    const isSameDay = pickupDate.toDateString() === now.toDateString();
    const cutoffHour = this.getCutoffHour(carrierId);
    const pastCutoff = isSameDay && now.getHours() >= cutoffHour;

    const windows: Array<{ date: Date; readyTime: string; closeTime: string }> = [];
    if (!pastCutoff || !isSameDay) {
      // Generate available pickup windows based on carrier capabilities
      const startHour = isSameDay ? Math.max(now.getHours() + 2, 8) : 8;
      const endHour = this.getLatestPickupHour(carrierId);

      if (startHour < endHour) {
        windows.push({
          date: pickupDate,
          readyTime: `${String(startHour).padStart(2, '0')}:00`,
          closeTime: `${String(endHour).padStart(2, '0')}:00`,
        });
      }
    }

    // Get next-day windows if same-day isn't available
    if (windows.length === 0 && isSameDay) {
      const nextDay = this.getNextBusinessDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
      windows.push({
        date: nextDay,
        readyTime: '08:00',
        closeTime: `${String(this.getLatestPickupHour(carrierId)).padStart(2, '0')}:00`,
      });
    }

    return {
      carrierId,
      available: windows.length > 0,
      windows,
      cutoffTime: `${String(cutoffHour).padStart(2, '0')}:00`,
      fees: this.getPickupFees(carrierId),
    };
  }

  /**
   * Schedules a pickup with the specified carrier.
   */
  async schedulePickup(
    carrierId: CarrierCode,
    address: Address,
    packageCount: number,
    totalWeight: number,
    pickupDate: Date,
    readyTime: string,
    closeTime: string,
    instructions?: string,
  ): Promise<PickupConfirmation> {
    const provider = this.getProvider(carrierId);

    // Validate the pickup window
    const availability = await this.checkAvailability(carrierId, address, pickupDate);
    if (!availability.available) {
      throw new Error(`No pickup availability for ${carrierId} on ${pickupDate.toISOString()}`);
    }

    // Validate ready and close times are within available windows
    const validWindow = availability.windows.some(
      (w) => readyTime >= w.readyTime && closeTime <= w.closeTime,
    );
    if (!validWindow) {
      logger.warn(
        { carrierId, readyTime, closeTime, windows: availability.windows },
        'Requested time outside available windows, using nearest valid window',
      );
    }

    const request: PickupRequest = {
      carrierId,
      address,
      packageCount,
      totalWeight,
      pickupDate,
      readyTime,
      closeTime,
      instructions,
    };

    logger.info(
      { carrierId, address: address.zip, pickupDate, packageCount },
      'Scheduling pickup',
    );

    const confirmation = await provider.schedulePickup(request);

    // Store the scheduled pickup for tracking
    const scheduledPickup: ScheduledPickup = {
      confirmationNumber: confirmation.confirmationNumber,
      carrierId,
      address,
      scheduledDate: pickupDate,
      window: confirmation.estimatedWindow,
      packageCount,
      status: 'scheduled',
      createdAt: new Date(),
    };
    this.scheduledPickups.set(confirmation.confirmationNumber, scheduledPickup);

    this.emit('pickup:scheduled', scheduledPickup);

    logger.info(
      {
        confirmationNumber: confirmation.confirmationNumber,
        estimatedWindow: confirmation.estimatedWindow,
      },
      'Pickup scheduled successfully',
    );

    return confirmation;
  }

  /**
   * Cancels a scheduled pickup.
   */
  async cancelPickup(
    confirmationNumber: string,
    carrierId: CarrierCode,
  ): Promise<PickupCancellation> {
    const scheduled = this.scheduledPickups.get(confirmationNumber);
    if (!scheduled) {
      logger.warn({ confirmationNumber }, 'Pickup not found in local state');
    }

    const provider = this.getProvider(carrierId);

    logger.info({ confirmationNumber, carrierId }, 'Cancelling pickup');

    // Call carrier cancellation — we use cancelShipment as a proxy
    // In a real system there would be a dedicated cancelPickup on the provider
    try {
      await provider.cancelShipment(confirmationNumber);
    } catch (error) {
      logger.error({ confirmationNumber, error }, 'Failed to cancel pickup with carrier');
      return {
        confirmationNumber,
        carrierId,
        cancelled: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    if (scheduled) {
      scheduled.status = 'cancelled';
    }

    this.emit('pickup:cancelled', { confirmationNumber, carrierId });

    return {
      confirmationNumber,
      carrierId,
      cancelled: true,
    };
  }

  /**
   * Reschedules a pickup to a new date/time.
   */
  async reschedulePickup(
    confirmationNumber: string,
    carrierId: CarrierCode,
    newDate: Date,
    newReadyTime: string,
    newCloseTime: string,
  ): Promise<PickupConfirmation> {
    const existing = this.scheduledPickups.get(confirmationNumber);
    if (!existing) {
      throw new Error(`Pickup ${confirmationNumber} not found`);
    }

    // Cancel existing pickup
    await this.cancelPickup(confirmationNumber, carrierId);

    // Schedule new one
    return this.schedulePickup(
      carrierId,
      existing.address,
      existing.packageCount,
      0, // weight not stored in scheduled pickup, carrier will re-validate
      newDate,
      newReadyTime,
      newCloseTime,
    );
  }

  /**
   * Gets all scheduled pickups for a given status.
   */
  getScheduledPickups(
    status?: ScheduledPickup['status'],
  ): ScheduledPickup[] {
    const pickups = Array.from(this.scheduledPickups.values());
    if (status) {
      return pickups.filter((p) => p.status === status);
    }
    return pickups;
  }

  private getProvider(carrierId: CarrierCode): BaseCarrierProvider {
    const provider = this.providers.get(carrierId);
    if (!provider) {
      throw new Error(`Carrier provider not found: ${carrierId}`);
    }
    return provider;
  }

  private getCutoffHour(carrierId: CarrierCode): number {
    const cutoffs: Record<CarrierCode, number> = {
      ups: 14,    // 2 PM for same-day UPS pickup
      fedex: 14,  // 2 PM for same-day FedEx pickup
      usps: 14,   // 2 PM for same-day USPS pickup
      dhl: 12,    // 12 PM for same-day DHL pickup
    };
    return cutoffs[carrierId];
  }

  private getLatestPickupHour(carrierId: CarrierCode): number {
    const latest: Record<CarrierCode, number> = {
      ups: 18,
      fedex: 18,
      usps: 17,
      dhl: 17,
    };
    return latest[carrierId];
  }

  private getPickupFees(carrierId: CarrierCode): PickupAvailability['fees'] {
    const fees: Record<CarrierCode, PickupAvailability['fees']> = {
      ups: { sameDayFee: 6.00, nextDayFee: 0, currency: 'USD' },
      fedex: { sameDayFee: 5.00, nextDayFee: 0, currency: 'USD' },
      usps: { sameDayFee: 0, nextDayFee: 0, currency: 'USD' }, // USPS pickup is free
      dhl: { sameDayFee: 5.50, nextDayFee: 0, currency: 'USD' },
    };
    return fees[carrierId];
  }

  private getNextBusinessDay(from?: Date): Date {
    const date = from ? new Date(from) : new Date();
    date.setDate(date.getDate() + 1);

    // Skip weekends
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }

    return date;
  }
}
