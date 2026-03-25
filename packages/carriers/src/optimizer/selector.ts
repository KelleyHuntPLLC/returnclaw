import pino from 'pino';
import {
  CarrierCode,
  BaseCarrierProvider,
  LabelRequest,
  Address,
  PackageDetails,
} from '../providers/base';
import { DropOffLocator, EnrichedDropOffLocation } from '../dropoff/locator';

const logger = pino({ name: 'carriers:carrier-selector' });

export interface CarrierOption {
  carrierId: CarrierCode;
  carrierName: string;
  serviceType: string;
  estimatedCost: number;
  currency: string;
  estimatedDeliveryDays: number;
  nearestDropOff?: EnrichedDropOffLocation;
  score: number;
  reasons: string[];
}

export interface SelectionCriteria {
  /** The label request details */
  labelRequest: LabelRequest;
  /** If the retailer requires a specific carrier */
  requiredCarrier?: CarrierCode;
  /** User's preferred carrier */
  preferredCarrier?: CarrierCode;
  /** What to optimize for */
  optimizeFor: 'cost' | 'speed' | 'convenience';
  /** Zip code for drop-off convenience scoring */
  userZip?: string;
}

/** Weights for the scoring algorithm (0-1, should sum to ~1) */
interface ScoringWeights {
  cost: number;
  speed: number;
  convenience: number;
  preference: number;
}

const OPTIMIZATION_WEIGHTS: Record<SelectionCriteria['optimizeFor'], ScoringWeights> = {
  cost: { cost: 0.5, speed: 0.15, convenience: 0.2, preference: 0.15 },
  speed: { cost: 0.15, speed: 0.5, convenience: 0.15, preference: 0.2 },
  convenience: { cost: 0.15, speed: 0.15, convenience: 0.5, preference: 0.2 },
};

/**
 * Estimated rates per carrier and service type.
 * In production these would come from carrier rating APIs.
 */
const ESTIMATED_RATES: Record<CarrierCode, Array<{
  serviceType: string;
  baseCost: number;
  perLbCost: number;
  deliveryDays: number;
}>> = {
  ups: [
    { serviceType: 'UPS Ground', baseCost: 8.50, perLbCost: 0.50, deliveryDays: 5 },
    { serviceType: 'UPS 2nd Day Air', baseCost: 18.00, perLbCost: 1.20, deliveryDays: 2 },
    { serviceType: 'UPS Next Day Air', baseCost: 32.00, perLbCost: 2.00, deliveryDays: 1 },
    { serviceType: 'UPS Next Day Air Saver', baseCost: 28.00, perLbCost: 1.80, deliveryDays: 1 },
  ],
  fedex: [
    { serviceType: 'FedEx Ground', baseCost: 8.00, perLbCost: 0.45, deliveryDays: 5 },
    { serviceType: 'FedEx Home Delivery', baseCost: 9.00, perLbCost: 0.55, deliveryDays: 5 },
    { serviceType: 'FedEx 2Day', baseCost: 17.50, perLbCost: 1.10, deliveryDays: 2 },
    { serviceType: 'FedEx Express Saver', baseCost: 22.00, perLbCost: 1.50, deliveryDays: 3 },
    { serviceType: 'FedEx Priority Overnight', baseCost: 35.00, perLbCost: 2.20, deliveryDays: 1 },
  ],
  usps: [
    { serviceType: 'USPS Ground Advantage', baseCost: 5.50, perLbCost: 0.30, deliveryDays: 5 },
    { serviceType: 'USPS Priority Mail', baseCost: 8.00, perLbCost: 0.40, deliveryDays: 3 },
    { serviceType: 'USPS Priority Mail Express', baseCost: 26.00, perLbCost: 1.50, deliveryDays: 1 },
  ],
  dhl: [
    { serviceType: 'DHL Express Worldwide', baseCost: 45.00, perLbCost: 3.00, deliveryDays: 3 },
    { serviceType: 'DHL Express 12:00', baseCost: 55.00, perLbCost: 4.00, deliveryDays: 2 },
    { serviceType: 'DHL Express 9:00', baseCost: 70.00, perLbCost: 5.00, deliveryDays: 1 },
  ],
};

const CARRIER_NAMES: Record<CarrierCode, string> = {
  ups: 'UPS',
  fedex: 'FedEx',
  usps: 'USPS',
  dhl: 'DHL',
};

export class CarrierSelector {
  private readonly providers: Map<CarrierCode, BaseCarrierProvider>;
  private readonly dropOffLocator: DropOffLocator;

  constructor(
    providers: Map<CarrierCode, BaseCarrierProvider>,
    dropOffLocator: DropOffLocator,
  ) {
    this.providers = providers;
    this.dropOffLocator = dropOffLocator;
  }

  /**
   * Selects the optimal carrier and returns a ranked list of options.
   */
  async selectCarrier(criteria: SelectionCriteria): Promise<CarrierOption[]> {
    // If a specific carrier is required, only consider that carrier
    if (criteria.requiredCarrier) {
      if (!this.providers.has(criteria.requiredCarrier)) {
        throw new Error(`Required carrier ${criteria.requiredCarrier} is not available`);
      }
      const options = await this.getOptionsForCarrier(
        criteria.requiredCarrier,
        criteria.labelRequest.package,
        criteria,
      );
      return options;
    }

    // Generate options for all available carriers
    const allOptions: CarrierOption[] = [];
    const carrierIds = Array.from(this.providers.keys());

    const optionSets = await Promise.allSettled(
      carrierIds.map((carrierId) =>
        this.getOptionsForCarrier(carrierId, criteria.labelRequest.package, criteria),
      ),
    );

    for (let i = 0; i < optionSets.length; i++) {
      const result = optionSets[i];
      if (result.status === 'fulfilled') {
        allOptions.push(...result.value);
      } else {
        logger.warn(
          { carrierId: carrierIds[i], error: result.reason },
          'Failed to get options for carrier',
        );
      }
    }

    if (allOptions.length === 0) {
      throw new Error('No carrier options available');
    }

    // Score and rank all options
    const weights = OPTIMIZATION_WEIGHTS[criteria.optimizeFor];
    const scored = this.scoreOptions(allOptions, criteria, weights);

    // Sort by score descending (higher is better)
    scored.sort((a, b) => b.score - a.score);

    logger.info(
      {
        optimizeFor: criteria.optimizeFor,
        totalOptions: scored.length,
        topOption: {
          carrier: scored[0].carrierId,
          service: scored[0].serviceType,
          cost: scored[0].estimatedCost,
          days: scored[0].estimatedDeliveryDays,
          score: scored[0].score,
        },
      },
      'Carrier selection complete',
    );

    return scored;
  }

  /**
   * Generates carrier options for a single carrier.
   */
  private async getOptionsForCarrier(
    carrierId: CarrierCode,
    pkg: PackageDetails,
    criteria: SelectionCriteria,
  ): Promise<CarrierOption[]> {
    const rates = ESTIMATED_RATES[carrierId];
    if (!rates) return [];

    // Calculate costs for each service type
    const options: CarrierOption[] = [];

    // Get nearest drop-off if user zip is available
    let nearestDropOff: EnrichedDropOffLocation | undefined;
    if (criteria.userZip) {
      try {
        const dropOff = await this.dropOffLocator.findNearest(criteria.userZip, carrierId);
        nearestDropOff = dropOff || undefined;
      } catch (error) {
        logger.debug({ carrierId, error }, 'Failed to find nearest drop-off');
      }
    }

    for (const rate of rates) {
      const estimatedCost = this.estimateCost(rate.baseCost, rate.perLbCost, pkg);

      // Skip DHL for domestic unless it's the only option
      if (carrierId === 'dhl' && criteria.labelRequest.from.country === criteria.labelRequest.to.country) {
        continue;
      }

      options.push({
        carrierId,
        carrierName: CARRIER_NAMES[carrierId],
        serviceType: rate.serviceType,
        estimatedCost: Math.round(estimatedCost * 100) / 100,
        currency: 'USD',
        estimatedDeliveryDays: rate.deliveryDays,
        nearestDropOff,
        score: 0,
        reasons: [],
      });
    }

    return options;
  }

  /**
   * Estimates shipping cost based on package weight and dimensions.
   */
  private estimateCost(baseCost: number, perLbCost: number, pkg: PackageDetails): number {
    // Use the greater of actual weight and dimensional weight
    const dimWeight = (pkg.length * pkg.width * pkg.height) / 139; // DIM factor
    const billableWeight = Math.max(pkg.weight, dimWeight);

    return baseCost + perLbCost * billableWeight;
  }

  /**
   * Scores all options based on the optimization criteria.
   */
  private scoreOptions(
    options: CarrierOption[],
    criteria: SelectionCriteria,
    weights: ScoringWeights,
  ): CarrierOption[] {
    if (options.length === 0) return [];

    // Find min/max for normalization
    const costs = options.map((o) => o.estimatedCost);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const costRange = maxCost - minCost || 1;

    const days = options.map((o) => o.estimatedDeliveryDays);
    const minDays = Math.min(...days);
    const maxDays = Math.max(...days);
    const daysRange = maxDays - minDays || 1;

    for (const option of options) {
      const reasons: string[] = [];

      // Cost score (lower cost = higher score, normalized 0-1)
      const costScore = 1 - (option.estimatedCost - minCost) / costRange;

      // Speed score (fewer days = higher score, normalized 0-1)
      const speedScore = 1 - (option.estimatedDeliveryDays - minDays) / daysRange;

      // Convenience score based on nearest drop-off distance
      let convenienceScore = 0.5; // default to neutral
      if (option.nearestDropOff) {
        const distance = option.nearestDropOff.distance;
        // Score: 1.0 if < 1 mile, 0.8 if < 3, 0.5 if < 5, 0.2 if < 10, 0 if > 10
        if (distance < 1) convenienceScore = 1.0;
        else if (distance < 3) convenienceScore = 0.8;
        else if (distance < 5) convenienceScore = 0.5;
        else if (distance < 10) convenienceScore = 0.2;
        else convenienceScore = 0;

        // Bonus for currently open locations
        if (option.nearestDropOff.isOpen) {
          convenienceScore = Math.min(1.0, convenienceScore + 0.1);
          reasons.push('Drop-off is currently open');
        }

        reasons.push(`Nearest drop-off: ${option.nearestDropOff.distance.toFixed(1)} mi`);
      }

      // Carrier preference bonus (USPS free pickup is a convenience bonus)
      let preferenceScore = 0.5;
      if (criteria.preferredCarrier && option.carrierId === criteria.preferredCarrier) {
        preferenceScore = 1.0;
        reasons.push('Preferred carrier');
      }
      if (option.carrierId === 'usps') {
        convenienceScore = Math.min(1.0, convenienceScore + 0.15);
        reasons.push('Free USPS home pickup available');
      }

      // Compute weighted total score
      option.score = Math.round(
        (costScore * weights.cost +
          speedScore * weights.speed +
          convenienceScore * weights.convenience +
          preferenceScore * weights.preference) *
          100,
      ) / 100;

      // Add informational reasons
      if (costScore >= 0.8) reasons.push('Low cost');
      if (speedScore >= 0.8) reasons.push('Fast delivery');
      if (option.estimatedDeliveryDays === 1) reasons.push('Next-day delivery');

      option.reasons = reasons;
    }

    return options;
  }
}
