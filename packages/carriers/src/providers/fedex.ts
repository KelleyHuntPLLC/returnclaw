import {
  BaseCarrierProvider,
  CarrierCode,
  CarrierError,
  LabelRequest,
  ShippingLabel,
  PickupRequest,
  PickupConfirmation,
  DropOffLocation,
  TrackingStatus,
  TrackingEvent,
  TrackingEventCode,
  Address,
  RequestOptions,
} from './base';

interface FedExOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface FedExShipmentResponse {
  transactionId: string;
  output: {
    transactionShipments: Array<{
      shipDatestamp: string;
      serviceName: string;
      serviceType: string;
      shipmentDocuments?: Array<{
        contentType: string;
        url: string;
      }>;
      pieceResponses: Array<{
        masterTrackingNumber: string;
        trackingNumber: string;
        packageDocuments: Array<{
          contentType: string;
          encodedLabel: string;
          docType: string;
          url?: string;
        }>;
      }>;
      completedShipmentDetail: {
        shipmentRating: {
          actualRateType: string;
          shipmentRateDetails: Array<{
            rateType: string;
            totalNetCharge: number;
            totalNetChargeWithDutiesAndTaxes: number;
            currency: string;
          }>;
        };
        operationalDetail: {
          transitTime: string;
          deliveryDate: string;
        };
      };
      alerts?: Array<{ code: string; message: string; alertType: string }>;
    }>;
  };
}

interface FedExPickupResponse {
  output: {
    pickupConfirmationCode: string;
    message: string;
    location: string;
  };
}

interface FedExLocationResponse {
  output: {
    resultsReturned: number;
    locationDetailList: Array<{
      locationId: string;
      distance: { value: number; units: string };
      contactAndAddress: {
        contact: { companyName: string; phoneNumber?: string };
        address: {
          streetLines: string[];
          city: string;
          stateOrProvinceCode: string;
          postalCode: string;
          countryCode: string;
        };
      };
      geoPositionalCoordinates: { latitude: number; longitude: number };
      storeHours: Array<{
        dayOfWeek: string;
        operationalHours: { begins: string; ends: string };
      }>;
      locationCapabilities: Array<{
        serviceType: string;
        description: string;
      }>;
      locationType: string;
    }>;
  };
}

interface FedExTrackingResponse {
  output: {
    completeTrackResults: Array<{
      trackingNumber: string;
      trackResults: Array<{
        trackingNumberInfo: {
          trackingNumber: string;
          trackingNumberUniqueId: string;
          carrierCode: string;
        };
        latestStatusDetail: {
          code: string;
          derivedCode: string;
          statusByLocale: string;
          description: string;
          scanLocation?: {
            city?: string;
            stateOrProvinceCode?: string;
            countryCode?: string;
          };
        };
        dateAndTimes: Array<{
          type: string;
          dateTime: string;
        }>;
        availableImages: Array<{
          type: string;
          size: string;
        }>;
        scanEvents: Array<{
          date: string;
          eventType: string;
          eventDescription: string;
          derivedStatus: string;
          scanLocation?: {
            city?: string;
            stateOrProvinceCode?: string;
            countryCode?: string;
          };
        }>;
        deliveryDetails?: {
          receivedByName?: string;
          deliveryAttempts?: number;
          signedByName?: string;
        };
        estimatedDeliveryTimeWindow?: {
          window: { begins: string; ends: string };
        };
      }>;
    }>;
  };
}

const FEDEX_SERVICE_TYPES: Record<string, string> = {
  ground: 'FEDEX_GROUND',
  home_delivery: 'GROUND_HOME_DELIVERY',
  express_saver: 'FEDEX_EXPRESS_SAVER',
  '2day': 'FEDEX_2_DAY',
  '2day_am': 'FEDEX_2_DAY_AM',
  overnight_standard: 'STANDARD_OVERNIGHT',
  overnight_priority: 'PRIORITY_OVERNIGHT',
  overnight_first: 'FIRST_OVERNIGHT',
  international_economy: 'INTERNATIONAL_ECONOMY',
  international_priority: 'INTERNATIONAL_PRIORITY',
  international_first: 'INTERNATIONAL_FIRST',
  freight_economy: 'FEDEX_FREIGHT_ECONOMY',
  freight_priority: 'FEDEX_FREIGHT_PRIORITY',
};

const FEDEX_SERVICE_NAMES: Record<string, string> = {
  FEDEX_GROUND: 'FedEx Ground',
  GROUND_HOME_DELIVERY: 'FedEx Home Delivery',
  FEDEX_EXPRESS_SAVER: 'FedEx Express Saver',
  FEDEX_2_DAY: 'FedEx 2Day',
  FEDEX_2_DAY_AM: 'FedEx 2Day A.M.',
  STANDARD_OVERNIGHT: 'FedEx Standard Overnight',
  PRIORITY_OVERNIGHT: 'FedEx Priority Overnight',
  FIRST_OVERNIGHT: 'FedEx First Overnight',
  INTERNATIONAL_ECONOMY: 'FedEx International Economy',
  INTERNATIONAL_PRIORITY: 'FedEx International Priority',
  INTERNATIONAL_FIRST: 'FedEx International First',
  FEDEX_FREIGHT_ECONOMY: 'FedEx Freight Economy',
  FEDEX_FREIGHT_PRIORITY: 'FedEx Freight Priority',
};

function mapFedExStatusToEventCode(
  eventType: string,
  derivedStatus: string,
): TrackingEventCode {
  const normalizedEvent = eventType.toUpperCase();
  const normalizedDerived = derivedStatus.toUpperCase();

  // Delivered states
  if (
    normalizedEvent === 'DL' ||
    normalizedDerived === 'DELIVERED'
  ) {
    return 'delivered';
  }

  // Out for delivery
  if (
    normalizedEvent === 'OD' ||
    normalizedDerived === 'OUT_FOR_DELIVERY'
  ) {
    return 'out_for_delivery';
  }

  // Created / label created
  if (
    normalizedEvent === 'OC' ||
    normalizedEvent === 'SH' ||
    normalizedDerived === 'INITIATED' ||
    normalizedDerived === 'LABEL_CREATED'
  ) {
    return 'created';
  }

  // Picked up
  if (
    normalizedEvent === 'PU' ||
    normalizedDerived === 'PICKED_UP'
  ) {
    return 'picked_up';
  }

  // Exception states
  if (
    normalizedEvent === 'DE' ||
    normalizedEvent === 'CA' ||
    normalizedEvent === 'SE' ||
    normalizedDerived === 'EXCEPTION' ||
    normalizedDerived === 'DELAY'
  ) {
    return 'exception';
  }

  // Return to sender
  if (
    normalizedEvent === 'RS' ||
    normalizedDerived === 'RETURN_TO_SHIPPER'
  ) {
    return 'returned';
  }

  // In transit (default for movement events)
  if (
    normalizedEvent === 'IT' ||
    normalizedEvent === 'AR' ||
    normalizedEvent === 'DP' ||
    normalizedEvent === 'AF' ||
    normalizedEvent === 'CC' ||
    normalizedDerived === 'IN_TRANSIT'
  ) {
    return 'in_transit';
  }

  return 'in_transit';
}

function formatFedExAddress(address: Address): Record<string, unknown> {
  return {
    streetLines: [address.street1, address.street2].filter(Boolean),
    city: address.city,
    stateOrProvinceCode: address.state,
    postalCode: address.zip,
    countryCode: address.country,
  };
}

function formatFedExContact(address: Address): Record<string, unknown> {
  return {
    personName: address.name,
    phoneNumber: address.phone || '0000000000',
    ...(address.email ? { emailAddress: address.email } : {}),
    ...(address.company ? { companyName: address.company } : {}),
  };
}

export class FedExProvider extends BaseCarrierProvider {
  readonly carrierId: CarrierCode = 'fedex';
  readonly name = 'FedEx';

  private clientId: string;
  private clientSecret: string;
  private accountNumber: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    super('https://apis.fedex.com');

    const clientId = process.env.FEDEX_CLIENT_ID;
    const clientSecret = process.env.FEDEX_CLIENT_SECRET;
    const accountNumber = process.env.FEDEX_ACCOUNT_NUMBER;

    if (!clientId || !clientSecret || !accountNumber) {
      throw new CarrierError(
        'Missing required FedEx environment variables: FEDEX_CLIENT_ID, FEDEX_CLIENT_SECRET, FEDEX_ACCOUNT_NUMBER',
        'fedex',
        'CONFIGURATION_ERROR',
      );
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accountNumber = accountNumber;
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    this.logger.info('Authenticating with FedEx OAuth 2.0');

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);

    const response = await this.makeRequest<FedExOAuthTokenResponse>(
      '/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    this.accessToken = response.access_token;
    this.tokenExpiresAt = Date.now() + response.expires_in * 1000;

    this.logger.info('FedEx OAuth token acquired successfully');

    return this.accessToken;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authenticate();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-customer-transaction-id': `rc-${Date.now()}`,
      'x-locale': 'en_US',
    };
  }

  async createLabel(request: LabelRequest): Promise<ShippingLabel> {
    const headers = await this.getAuthHeaders();

    const serviceType = request.serviceType
      ? FEDEX_SERVICE_TYPES[request.serviceType] || request.serviceType
      : 'FEDEX_GROUND';

    const sender = request.isReturn ? request.to : request.from;
    const recipient = request.isReturn ? request.from : request.to;

    const shipmentPayload = {
      labelResponseOptions: 'LABEL',
      requestedShipment: {
        shipper: {
          contact: formatFedExContact(sender),
          address: formatFedExAddress(sender),
        },
        recipients: [
          {
            contact: formatFedExContact(recipient),
            address: formatFedExAddress(recipient),
          },
        ],
        shipDatestamp: new Date().toISOString().split('T')[0],
        serviceType,
        packagingType: 'YOUR_PACKAGING',
        pickupType: 'USE_SCHEDULED_PICKUP',
        blockInsightVisibility: false,
        shippingChargesPayment: {
          paymentType: 'SENDER',
          payor: {
            responsibleParty: {
              accountNumber: { value: this.accountNumber },
            },
          },
        },
        labelSpecification: {
          imageType: 'PDF',
          labelStockType: 'PAPER_4X6',
          labelPrintingOrientation: 'TOP_EDGE_OF_TEXT_FIRST',
          labelOrder: 'SHIPPING_LABEL_FIRST',
        },
        requestedPackageLineItems: [
          {
            weight: {
              value: request.package.weight,
              units: 'LB',
            },
            dimensions: {
              length: request.package.length,
              width: request.package.width,
              height: request.package.height,
              units: 'IN',
            },
            ...(request.package.description
              ? { itemDescription: request.package.description }
              : {}),
            ...(request.package.value
              ? {
                  declaredValue: {
                    amount: request.package.value,
                    currency: 'USD',
                  },
                }
              : {}),
          },
        ],
        ...(request.isReturn
          ? {
              shipmentSpecialServices: {
                specialServiceTypes: ['RETURN_SHIPMENT'],
                returnShipmentDetail: {
                  returnType: 'PRINT_RETURN_LABEL',
                },
              },
            }
          : {}),
        ...(request.referenceNumber
          ? {
              customsClearanceDetail: undefined,
              shipmentSpecialServices: {
                ...((request.isReturn
                  ? {
                      specialServiceTypes: ['RETURN_SHIPMENT'],
                      returnShipmentDetail: {
                        returnType: 'PRINT_RETURN_LABEL',
                      },
                    }
                  : { specialServiceTypes: [] }) as Record<string, unknown>),
              },
            }
          : {}),
      },
      accountNumber: { value: this.accountNumber },
    };

    // If it's a return and there's a reference number, add it to package line items
    if (request.referenceNumber) {
      (shipmentPayload.requestedShipment.requestedPackageLineItems[0] as Record<string, unknown>).customerReferences = [
        {
          customerReferenceType: 'CUSTOMER_REFERENCE',
          value: request.referenceNumber,
        },
      ];
    }

    this.logger.info(
      { serviceType, isReturn: request.isReturn },
      'Creating FedEx shipment label',
    );

    const response = await this.makeRequest<FedExShipmentResponse>(
      '/ship/v1/shipments',
      {
        method: 'POST',
        headers,
        body: shipmentPayload,
      },
    );

    const transactionShipment = response.output.transactionShipments[0];
    if (!transactionShipment) {
      throw new CarrierError(
        'FedEx shipment response did not contain transaction shipments',
        'fedex',
        'INVALID_RESPONSE',
      );
    }

    // Log any alerts
    if (transactionShipment.alerts && transactionShipment.alerts.length > 0) {
      this.logger.warn(
        { alerts: transactionShipment.alerts },
        'FedEx shipment created with alerts',
      );
    }

    const pieceResponse = transactionShipment.pieceResponses[0];
    if (!pieceResponse) {
      throw new CarrierError(
        'FedEx shipment response did not contain piece responses',
        'fedex',
        'INVALID_RESPONSE',
      );
    }

    const packageDoc = pieceResponse.packageDocuments[0];
    if (!packageDoc) {
      throw new CarrierError(
        'FedEx shipment response did not contain package documents',
        'fedex',
        'INVALID_RESPONSE',
      );
    }

    const labelData = Buffer.from(packageDoc.encodedLabel, 'base64');

    const rateDetail =
      transactionShipment.completedShipmentDetail?.shipmentRating
        ?.shipmentRateDetails?.[0];
    const cost = rateDetail?.totalNetCharge ?? 0;
    const currency = rateDetail?.currency ?? 'USD';

    const deliveryDateStr =
      transactionShipment.completedShipmentDetail?.operationalDetail
        ?.deliveryDate;
    const estimatedDeliveryDate = deliveryDateStr
      ? new Date(deliveryDateStr)
      : undefined;

    return {
      trackingNumber: pieceResponse.trackingNumber,
      carrierId: 'fedex',
      labelUrl: packageDoc.url || '',
      labelFormat: 'PDF',
      labelData,
      estimatedDeliveryDate,
      cost,
      currency,
      serviceType:
        FEDEX_SERVICE_NAMES[serviceType] ||
        transactionShipment.serviceName ||
        serviceType,
    };
  }

  async schedulePickup(request: PickupRequest): Promise<PickupConfirmation> {
    const headers = await this.getAuthHeaders();

    const pickupDate = request.pickupDate.toISOString().split('T')[0];

    const pickupPayload = {
      associatedAccountNumber: { value: this.accountNumber },
      originDetail: {
        pickupAddressDetail: {
          contact: {
            personName: request.address.name,
            phoneNumber: request.address.phone || '0000000000',
            ...(request.address.company
              ? { companyName: request.address.company }
              : {}),
          },
          address: formatFedExAddress(request.address),
        },
        readyDateTimestamp: `${pickupDate}T${request.readyTime}:00`,
        customerCloseTime: request.closeTime.replace(':', ''),
        pickupDateType: 'SAME_DAY',
        packageLocation: 'FRONT',
        buildingPartCode: 'SUITE',
        ...(request.instructions
          ? { instructions: request.instructions }
          : {}),
      },
      carrierCode: 'FDXE',
      totalWeight: {
        value: request.totalWeight,
        units: 'LB',
      },
      packageCount: request.packageCount,
      accountNumber: { value: this.accountNumber },
      countryRelationships: 'DOMESTIC',
      pickupType: 'ON_CALL',
    };

    this.logger.info(
      { pickupDate, packageCount: request.packageCount },
      'Scheduling FedEx pickup',
    );

    const response = await this.makeRequest<FedExPickupResponse>(
      '/pickup/v1/pickups',
      {
        method: 'POST',
        headers,
        body: pickupPayload,
      },
    );

    return {
      confirmationNumber: response.output.pickupConfirmationCode,
      carrierId: 'fedex',
      pickupDate: request.pickupDate,
      estimatedWindow: {
        start: request.readyTime,
        end: request.closeTime,
      },
    };
  }

  async getDropOffLocations(
    zip: string,
    radius: number,
  ): Promise<DropOffLocation[]> {
    const headers = await this.getAuthHeaders();

    this.logger.info(
      { zip, radius },
      'Searching for FedEx drop-off locations',
    );

    const response = await this.makeRequest<FedExLocationResponse>(
      '/location/v1/locations',
      {
        method: 'POST',
        headers,
        body: {
          locationsSummaryRequestControlParameters: {
            maxResults: 20,
            distance: {
              value: radius,
              units: 'MI',
            },
          },
          locationSearchCriterion: 'ADDRESS',
          location: {
            address: {
              postalCode: zip,
              countryCode: 'US',
            },
          },
          locationTypes: [
            'FEDEX_OFFICE',
            'FEDEX_SHIP_CENTER',
            'FEDEX_AUTHORIZED_SHIP_CENTER',
            'FEDEX_SELF_SERVICE',
            'WALGREENS',
            'DOLLAR_GENERAL',
          ],
          sort: {
            criteria: 'DISTANCE',
            order: 'ASCENDING',
          },
        },
      },
    );

    const locations = response.output?.locationDetailList || [];

    return locations.map((loc) => {
      const addr = loc.contactAndAddress.address;
      const contact = loc.contactAndAddress.contact;

      const hours = (loc.storeHours || []).map((h) => ({
        day: h.dayOfWeek,
        open: h.operationalHours.begins,
        close: h.operationalHours.ends,
      }));

      const services = (loc.locationCapabilities || []).map(
        (cap) => cap.description,
      );

      return {
        id: loc.locationId,
        carrierId: 'fedex' as CarrierCode,
        name: contact.companyName || loc.locationType,
        address: {
          name: contact.companyName || loc.locationType,
          street1: addr.streetLines[0] || '',
          street2: addr.streetLines[1],
          city: addr.city,
          state: addr.stateOrProvinceCode,
          zip: addr.postalCode,
          country: addr.countryCode,
          phone: contact.phoneNumber,
        },
        distance: loc.distance.value,
        hours,
        services,
        latitude: loc.geoPositionalCoordinates.latitude,
        longitude: loc.geoPositionalCoordinates.longitude,
      };
    });
  }

  async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
    const headers = await this.getAuthHeaders();

    this.logger.info({ trackingNumber }, 'Getting FedEx tracking status');

    const response = await this.makeRequest<FedExTrackingResponse>(
      '/track/v1/trackingnumbers',
      {
        method: 'POST',
        headers,
        body: {
          trackingInfo: [
            {
              trackingNumberInfo: {
                trackingNumber,
              },
            },
          ],
          includeDetailedScans: true,
        },
      },
    );

    const completeResult = response.output.completeTrackResults[0];
    if (!completeResult) {
      throw new CarrierError(
        `No tracking data found for ${trackingNumber}`,
        'fedex',
        'TRACKING_NOT_FOUND',
      );
    }

    const trackResult = completeResult.trackResults[0];
    if (!trackResult) {
      throw new CarrierError(
        `No track result found for ${trackingNumber}`,
        'fedex',
        'TRACKING_NOT_FOUND',
      );
    }

    const events: TrackingEvent[] = (trackResult.scanEvents || []).map(
      (event) => {
        const locationParts: string[] = [];
        if (event.scanLocation?.city) locationParts.push(event.scanLocation.city);
        if (event.scanLocation?.stateOrProvinceCode) {
          locationParts.push(event.scanLocation.stateOrProvinceCode);
        }
        if (event.scanLocation?.countryCode) {
          locationParts.push(event.scanLocation.countryCode);
        }

        return {
          timestamp: new Date(event.date),
          status: mapFedExStatusToEventCode(
            event.eventType,
            event.derivedStatus,
          ),
          description: event.eventDescription,
          location:
            locationParts.length > 0 ? locationParts.join(', ') : undefined,
        };
      },
    );

    // Sort events newest first
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const latestStatus = trackResult.latestStatusDetail;
    const currentStatus = latestStatus
      ? mapFedExStatusToEventCode(
          latestStatus.code,
          latestStatus.derivedCode,
        )
      : events.length > 0
        ? events[0].status
        : 'created';

    // Extract estimated delivery date
    const estimatedDeliveryEntry = (trackResult.dateAndTimes || []).find(
      (d) =>
        d.type === 'ESTIMATED_DELIVERY' ||
        d.type === 'ACTUAL_DELIVERY',
    );
    const estimatedDeliveryDate = estimatedDeliveryEntry
      ? new Date(estimatedDeliveryEntry.dateTime)
      : undefined;

    return {
      trackingNumber,
      carrierId: 'fedex',
      currentStatus,
      estimatedDeliveryDate,
      events,
      signedBy: trackResult.deliveryDetails?.signedByName,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    const headers = await this.getAuthHeaders();

    this.logger.info({ trackingNumber }, 'Cancelling FedEx shipment');

    try {
      await this.makeRequest<{ output: { cancelledShipment: boolean } }>(
        '/ship/v1/shipments/cancel',
        {
          method: 'PUT',
          headers,
          body: {
            accountNumber: { value: this.accountNumber },
            trackingNumber,
            senderCountryCode: 'US',
            deletionControl: 'DELETE_ALL_PACKAGES',
          },
        },
      );

      this.logger.info(
        { trackingNumber },
        'FedEx shipment cancelled successfully',
      );
      return true;
    } catch (error) {
      if (error instanceof CarrierError) {
        // FedEx returns specific error codes for shipments that cannot be cancelled
        if (
          error.code === 'SHIPMENT.ALREADY.CANCELLED' ||
          error.code === 'SHIPMENT.ALREADY.DELIVERED' ||
          error.code === 'SHIPMENT.IN.TRANSIT'
        ) {
          this.logger.warn(
            { trackingNumber, code: error.code },
            'FedEx shipment cannot be cancelled',
          );
          return false;
        }
      }
      throw error;
    }
  }
}
