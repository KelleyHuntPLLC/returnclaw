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

interface DHLAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface DHLShipmentResponse {
  shipmentTrackingNumber: string;
  trackingUrl: string;
  dispatchConfirmationNumber: string;
  cancelPickupUrl: string;
  packages: Array<{
    trackingNumber: string;
    referenceNumber: number;
    trackingUrl: string;
    volumetricWeight: number;
    documents: Array<{
      imageFormat: string;
      content: string;
      typeCode: string;
    }>;
  }>;
  documents: Array<{
    imageFormat: string;
    content: string;
    typeCode: string;
  }>;
  shipmentCharges: Array<{
    currencyType: string;
    price: number;
    typeCode: string;
  }>;
  estimatedDeliveryDate: {
    estimatedDeliveryDate: string;
    estimatedDeliveryType: string;
  };
}

interface DHLPickupResponse {
  dispatchConfirmationNumbers: string[];
  readyByTime: string;
  nextPickingDate: string;
  warnings?: string[];
}

interface DHLLocationResponse {
  locations: Array<{
    url: string;
    location: {
      ids: Array<{ locationId: string; provider: string }>;
      keyword: string;
      keywordId: string;
      type: string;
    };
    name: string;
    distance: number;
    place: {
      address: {
        streetAddress: string;
        addressLocality: string;
        postalCode: string;
        countryCode: string;
      };
      geo: { latitude: number; longitude: number };
    };
    serviceTypes: string[];
    openingHours: Array<{
      dayOfWeek: string;
      opens: string;
      closes: string;
    }>;
    closurePeriods?: Array<{
      fromDate: string;
      toDate: string;
    }>;
    containsInformation?: string;
  }>;
}

interface DHLTrackingResponse {
  shipments: Array<{
    id: string;
    service: string;
    origin: {
      address: { addressLocality: string; countryCode: string };
    };
    destination: {
      address: { addressLocality: string; countryCode: string };
    };
    status: {
      timestamp: string;
      location: {
        address: {
          addressLocality: string;
          countryCode?: string;
        };
      };
      statusCode: string;
      status: string;
      description: string;
    };
    estimatedTimeOfDelivery?: string;
    estimatedDeliveryTimeFrame?: {
      estimatedFrom: string;
      estimatedThrough: string;
    };
    estimatedTimeOfDeliveryRemark?: string;
    details: {
      proofOfDelivery?: {
        timestamp: string;
        signatureUrl?: string;
        documentUrl?: string;
        signed?: { name: string };
      };
      totalNumberOfPieces: number;
      pieceIds: string[];
      weight: { value: number; unitText: string };
    };
    events: Array<{
      timestamp: string;
      location?: {
        address: {
          addressLocality: string;
          countryCode?: string;
        };
      };
      statusCode: string;
      status: string;
      description: string;
    }>;
  }>;
}

const DHL_PRODUCT_CODES: Record<string, string> = {
  express_worldwide: 'P',
  express_worldwide_nondoc: 'D',
  express_9: 'E',
  express_10: 'Y',
  express_12: 'T',
  domestic_express: 'N',
  economy_select: 'H',
  express_easy: 'W',
  globalmail_business: 'G',
  return_express: 'K',
  return_connect: 'L',
};

const DHL_PRODUCT_NAMES: Record<string, string> = {
  P: 'DHL Express Worldwide',
  D: 'DHL Express Worldwide (Non-Doc)',
  E: 'DHL Express 9:00',
  Y: 'DHL Express 10:30',
  T: 'DHL Express 12:00',
  N: 'DHL Domestic Express',
  H: 'DHL Economy Select',
  W: 'DHL Express Easy',
  G: 'DHL Global Mail Business',
  K: 'DHL Express Return',
  L: 'DHL Return Connect',
};

function mapDHLStatusToEventCode(statusCode: string): TrackingEventCode {
  const code = statusCode.toLowerCase();

  // Pre-transit / created
  if (code === 'pre-transit' || code === 'informationreceived' || code === 'booking') {
    return 'created';
  }

  // Picked up
  if (code === 'pickup' || code === 'collected' || code === 'transit_pickup') {
    return 'picked_up';
  }

  // In transit
  if (
    code === 'transit' ||
    code === 'in_transit' ||
    code === 'processedatexportfacility' ||
    code === 'processedatimportfacility' ||
    code === 'departed' ||
    code === 'arrived' ||
    code === 'customs' ||
    code === 'clearance' ||
    code === 'processing'
  ) {
    return 'in_transit';
  }

  // Out for delivery
  if (
    code === 'out_for_delivery' ||
    code === 'outfordelivery' ||
    code === 'transit_outfordelivery'
  ) {
    return 'out_for_delivery';
  }

  // Delivered
  if (code === 'delivered' || code === 'ok' || code === 'transit_delivered') {
    return 'delivered';
  }

  // Exception
  if (
    code === 'failure' ||
    code === 'exception' ||
    code === 'unknown' ||
    code === 'customs_issue' ||
    code === 'held' ||
    code === 'refused' ||
    code === 'missorted'
  ) {
    return 'exception';
  }

  // Return
  if (
    code === 'returned' ||
    code === 'return' ||
    code === 'return_to_sender'
  ) {
    return 'returned';
  }

  return 'in_transit';
}

function formatDHLAddress(
  address: Address,
): {
  postalAddress: Record<string, unknown>;
  contactInformation: Record<string, unknown>;
} {
  return {
    postalAddress: {
      streetLines: [address.street1, address.street2].filter(Boolean),
      cityName: address.city,
      provinceCode: address.state,
      postalCode: address.zip,
      countryCode: address.country,
    },
    contactInformation: {
      phone: address.phone || '0000000000',
      companyName: address.company || address.name,
      fullName: address.name,
      ...(address.email ? { email: address.email } : {}),
    },
  };
}

function formatDHLDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export class DHLProvider extends BaseCarrierProvider {
  readonly carrierId: CarrierCode = 'dhl';
  readonly name = 'DHL Express';

  private apiKey: string;
  private apiSecret: string;
  private accountNumber: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    super('https://express.api.dhl.com');

    const apiKey = process.env.DHL_API_KEY;
    const apiSecret = process.env.DHL_API_SECRET;
    const accountNumber = process.env.DHL_ACCOUNT_NUMBER;

    if (!apiKey || !apiSecret || !accountNumber) {
      throw new CarrierError(
        'Missing required DHL environment variables: DHL_API_KEY, DHL_API_SECRET, DHL_ACCOUNT_NUMBER',
        'dhl',
        'CONFIGURATION_ERROR',
      );
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accountNumber = accountNumber;
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    this.logger.info('Authenticating with DHL Express API');

    const credentials = Buffer.from(
      `${this.apiKey}:${this.apiSecret}`,
    ).toString('base64');

    const response = await this.makeRequest<DHLAuthTokenResponse>(
      '/mydhlapi/auth/accesstoken',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
        body: {},
      },
    );

    this.accessToken = response.access_token;
    this.tokenExpiresAt = Date.now() + response.expires_in * 1000;

    this.logger.info('DHL API token acquired successfully');

    return this.accessToken;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authenticate();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Message-Reference': `rc-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
      'Message-Reference-Date': new Date().toISOString(),
    };
  }

  async createLabel(request: LabelRequest): Promise<ShippingLabel> {
    const headers = await this.getAuthHeaders();

    const productCode = request.serviceType
      ? DHL_PRODUCT_CODES[request.serviceType] || request.serviceType
      : request.isReturn
        ? 'K' // DHL Express Return
        : 'P'; // DHL Express Worldwide

    const sender = request.isReturn ? request.to : request.from;
    const recipient = request.isReturn ? request.from : request.to;

    const senderFormatted = formatDHLAddress(sender);
    const recipientFormatted = formatDHLAddress(recipient);

    const plannedShippingDate = formatDHLDate(new Date());

    const shipmentPayload = {
      plannedShippingDateAndTime: `${plannedShippingDate}T10:00:00 GMT+00:00`,
      pickup: {
        isRequested: false,
      },
      productCode,
      accounts: [
        {
          typeCode: 'shipper',
          number: this.accountNumber,
        },
      ],
      customerDetails: {
        shipperDetails: {
          ...senderFormatted,
          registrationNumbers: [],
          bankDetails: [],
          typeCode: request.isReturn ? 'direct_consumer' : 'business',
        },
        receiverDetails: {
          ...recipientFormatted,
          registrationNumbers: [],
          bankDetails: [],
          typeCode: request.isReturn ? 'business' : 'direct_consumer',
        },
      },
      content: {
        packages: [
          {
            weight: request.package.weight * 0.453592, // Convert lbs to kg
            dimensions: {
              length: Math.round(request.package.length * 2.54), // Convert inches to cm
              width: Math.round(request.package.width * 2.54),
              height: Math.round(request.package.height * 2.54),
            },
            ...(request.referenceNumber
              ? { customerReferences: [{ value: request.referenceNumber, typeCode: 'CU' }] }
              : {}),
          },
        ],
        isCustomsDeclarable:
          sender.country !== recipient.country,
        declaredValue: request.package.value ?? 0,
        declaredValueCurrency: 'USD',
        unitOfMeasurement: 'metric',
        description: request.package.description || 'Return Package',
        ...(sender.country !== recipient.country
          ? {
              exportDeclaration: {
                lineItems: [
                  {
                    number: 1,
                    description:
                      request.package.description || 'Return Package',
                    price: request.package.value ?? 0,
                    quantity: {
                      value: 1,
                      unitOfMeasurement: 'PCS',
                    },
                    weight: {
                      netValue: request.package.weight * 0.453592,
                      grossValue: request.package.weight * 0.453592,
                    },
                    manufacturerCountry: sender.country,
                    commodityCodes: [
                      { typeCode: 'outbound', value: '999999' },
                    ],
                  },
                ],
                invoice: {
                  number: request.referenceNumber || `INV-${Date.now()}`,
                  date: plannedShippingDate,
                },
                exportReason: request.isReturn
                  ? 'Return'
                  : 'Sale',
                exportReasonType: request.isReturn
                  ? 'return'
                  : 'permanent',
              },
            }
          : {}),
      },
      ...(request.isReturn
        ? {
            valueAddedServices: [
              {
                serviceCode: 'PT',
                value: 0,
                currency: 'USD',
              },
            ],
          }
        : {}),
      outputImageProperties: {
        printerDPI: 300,
        encodingFormat: 'pdf',
        imageOptions: [
          {
            typeCode: 'label',
            templateName: 'ECOM26_84_001',
          },
        ],
        splitTransportAndWaybillDocLabels: true,
      },
      ...(request.referenceNumber
        ? { customerReferences: [{ value: request.referenceNumber, typeCode: 'CU' }] }
        : {}),
    };

    this.logger.info(
      { productCode, isReturn: request.isReturn },
      'Creating DHL shipment label',
    );

    const response = await this.makeRequest<DHLShipmentResponse>(
      '/mydhlapi/shipments',
      {
        method: 'POST',
        headers,
        body: shipmentPayload,
      },
    );

    // Find the label document from the response
    let labelContent = '';
    let labelFormat: 'PDF' | 'PNG' | 'ZPL' = 'PDF';

    // Check package-level documents first
    const packageDoc = response.packages?.[0]?.documents?.find(
      (doc) => doc.typeCode === 'label',
    );
    if (packageDoc) {
      labelContent = packageDoc.content;
      labelFormat = packageDoc.imageFormat?.toUpperCase() === 'ZPL'
        ? 'ZPL'
        : packageDoc.imageFormat?.toUpperCase() === 'PNG'
          ? 'PNG'
          : 'PDF';
    }

    // Fall back to shipment-level documents
    if (!labelContent) {
      const shipmentDoc = response.documents?.find(
        (doc) => doc.typeCode === 'label',
      );
      if (shipmentDoc) {
        labelContent = shipmentDoc.content;
        labelFormat = shipmentDoc.imageFormat?.toUpperCase() === 'ZPL'
          ? 'ZPL'
          : shipmentDoc.imageFormat?.toUpperCase() === 'PNG'
            ? 'PNG'
            : 'PDF';
      }
    }

    if (!labelContent) {
      throw new CarrierError(
        'DHL shipment response did not contain a label document',
        'dhl',
        'INVALID_RESPONSE',
      );
    }

    const labelData = Buffer.from(labelContent, 'base64');

    // Extract cost from shipment charges
    const totalCharge = response.shipmentCharges?.find(
      (charge) => charge.typeCode === 'total' || charge.typeCode === 'TOTAL',
    );
    const cost = totalCharge?.price ?? 0;
    const currency = totalCharge?.currencyType ?? 'USD';

    const estimatedDeliveryDate = response.estimatedDeliveryDate?.estimatedDeliveryDate
      ? new Date(response.estimatedDeliveryDate.estimatedDeliveryDate)
      : undefined;

    return {
      trackingNumber: response.shipmentTrackingNumber,
      carrierId: 'dhl',
      labelUrl: response.trackingUrl || '',
      labelFormat,
      labelData,
      estimatedDeliveryDate,
      cost,
      currency,
      serviceType: DHL_PRODUCT_NAMES[productCode] || productCode,
    };
  }

  async schedulePickup(request: PickupRequest): Promise<PickupConfirmation> {
    const headers = await this.getAuthHeaders();

    const pickupDate = formatDHLDate(request.pickupDate);
    const addressFormatted = formatDHLAddress(request.address);

    const pickupPayload = {
      plannedPickupDateAndTime: `${pickupDate}T${request.readyTime}:00 GMT+00:00`,
      closeTime: request.closeTime.replace(':', ''),
      location: 'reception',
      locationType: 'business',
      accounts: [
        {
          typeCode: 'shipper',
          number: this.accountNumber,
        },
      ],
      customerDetails: {
        shipperDetails: {
          ...addressFormatted,
        },
      },
      specialInstructions: [
        {
          value: request.instructions || 'Package return pickup',
          typeCode: 'TBD',
        },
      ],
      shipmentDetails: [
        {
          productCode: 'P',
          accounts: [
            {
              typeCode: 'shipper',
              number: this.accountNumber,
            },
          ],
          packages: [
            {
              weight: request.totalWeight * 0.453592, // Convert lbs to kg
              dimensions: { length: 30, width: 20, height: 15 },
            },
          ],
          isCustomsDeclarable: false,
          unitOfMeasurement: 'metric',
          description: 'Return Package Pickup',
        },
      ],
    };

    this.logger.info(
      { pickupDate, packageCount: request.packageCount },
      'Scheduling DHL pickup',
    );

    const response = await this.makeRequest<DHLPickupResponse>(
      '/mydhlapi/pickups',
      {
        method: 'POST',
        headers,
        body: pickupPayload,
      },
    );

    const confirmationNumber =
      response.dispatchConfirmationNumbers?.[0] || '';

    if (!confirmationNumber) {
      throw new CarrierError(
        'DHL pickup response did not contain a confirmation number',
        'dhl',
        'INVALID_RESPONSE',
      );
    }

    // Log any warnings
    if (response.warnings && response.warnings.length > 0) {
      this.logger.warn(
        { warnings: response.warnings },
        'DHL pickup scheduled with warnings',
      );
    }

    return {
      confirmationNumber,
      carrierId: 'dhl',
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
      'Searching for DHL drop-off locations',
    );

    // DHL location API uses geocoded postal codes, so we search by postal code
    const response = await this.makeRequest<DHLLocationResponse>(
      '/mydhlapi/locations',
      {
        method: 'GET',
        headers,
        body: {
          countryCode: 'US',
          postalCode: zip,
          radius: String(radius),
          radiusUnit: 'mi',
          limit: '20',
          locationType: 'servicepoint,locker,postoffice,postbank',
        },
      },
    );

    const locations = response.locations || [];

    return locations.map((loc) => {
      const addr = loc.place.address;
      const geo = loc.place.geo;
      const locationId =
        loc.location.ids?.[0]?.locationId || loc.location.keywordId || '';

      // DHL locations may not include a full state/province, derive from address
      const hours = (loc.openingHours || []).map((h) => ({
        day: h.dayOfWeek,
        open: h.opens,
        close: h.closes,
      }));

      return {
        id: locationId,
        carrierId: 'dhl' as CarrierCode,
        name: loc.name,
        address: {
          name: loc.name,
          street1: addr.streetAddress,
          city: addr.addressLocality,
          state: '', // DHL API does not always return state
          zip: addr.postalCode,
          country: addr.countryCode,
        },
        distance: loc.distance,
        hours,
        services: loc.serviceTypes || [],
        latitude: geo.latitude,
        longitude: geo.longitude,
      };
    });
  }

  async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
    const headers = await this.getAuthHeaders();

    this.logger.info({ trackingNumber }, 'Getting DHL tracking status');

    const response = await this.makeRequest<DHLTrackingResponse>(
      '/mydhlapi/tracking',
      {
        method: 'GET',
        headers,
        body: {
          shipmentTrackingNumber: trackingNumber,
          allCheckpoints: 'true',
          language: 'en',
        },
      },
    );

    const shipment = response.shipments?.[0];
    if (!shipment) {
      throw new CarrierError(
        `No tracking data found for ${trackingNumber}`,
        'dhl',
        'TRACKING_NOT_FOUND',
      );
    }

    const events: TrackingEvent[] = (shipment.events || []).map((event) => {
      const locationParts: string[] = [];
      if (event.location?.address?.addressLocality) {
        locationParts.push(event.location.address.addressLocality);
      }
      if (event.location?.address?.countryCode) {
        locationParts.push(event.location.address.countryCode);
      }

      return {
        timestamp: new Date(event.timestamp),
        status: mapDHLStatusToEventCode(event.statusCode),
        description: event.description || event.status,
        location:
          locationParts.length > 0 ? locationParts.join(', ') : undefined,
      };
    });

    // Sort events newest first
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const currentStatus = shipment.status
      ? mapDHLStatusToEventCode(shipment.status.statusCode)
      : events.length > 0
        ? events[0].status
        : 'created';

    const estimatedDeliveryDate = shipment.estimatedTimeOfDelivery
      ? new Date(shipment.estimatedTimeOfDelivery)
      : shipment.estimatedDeliveryTimeFrame?.estimatedFrom
        ? new Date(shipment.estimatedDeliveryTimeFrame.estimatedFrom)
        : undefined;

    const signedBy = shipment.details?.proofOfDelivery?.signed?.name;

    return {
      trackingNumber,
      carrierId: 'dhl',
      currentStatus,
      estimatedDeliveryDate,
      events,
      signedBy,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    const headers = await this.getAuthHeaders();

    this.logger.info({ trackingNumber }, 'Cancelling DHL shipment');

    try {
      await this.makeRequest<void>(
        `/mydhlapi/shipments/${encodeURIComponent(trackingNumber)}`,
        {
          method: 'DELETE',
          headers,
        },
      );

      this.logger.info(
        { trackingNumber },
        'DHL shipment cancelled successfully',
      );
      return true;
    } catch (error) {
      if (error instanceof CarrierError) {
        // DHL returns specific error codes for shipments that cannot be cancelled
        if (
          error.code === 'SHIPMENT_NOT_FOUND' ||
          error.code === 'SHIPMENT_ALREADY_PICKED_UP' ||
          error.code === 'SHIPMENT_ALREADY_CANCELLED' ||
          error.statusCode === 404 ||
          error.statusCode === 409
        ) {
          this.logger.warn(
            { trackingNumber, code: error.code },
            'DHL shipment cannot be cancelled',
          );
          return false;
        }
      }
      throw error;
    }
  }
}
