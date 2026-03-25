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

interface USPSOAuthTokenResponse {
  access_token: string;
  token_type: string;
  issued_at: string;
  expires_in: number;
  status: string;
  scope: string;
  issuer: string;
  client_id: string;
  application_name: string;
  api_products: string;
  public_key: string;
}

interface USPSLabelResponse {
  labelMetadata: {
    labelAddress: {
      streetAddress: string;
      city: string;
      state: string;
      ZIPCode: string;
    };
    trackingNumber: string;
    routingInformation: string;
    postage: number;
    extraServices: Array<{ name: string; price: number }>;
    SKU: string;
    labelBrokerID: string;
  };
  labelImage: string; // base64-encoded label
  receiptImage?: string;
}

interface USPSPickupResponse {
  confirmationNumber: string;
  pickupDate: string;
  carrierPickupDate: string;
  packageDescription: string;
  estimatedWeight: string;
  pickupLocation: string;
  specialInstructions: string;
}

interface USPSLocationResponse {
  postOffices: Array<{
    facilityID: string;
    facilityName: string;
    facilityType: string;
    streetAddress: string;
    city: string;
    state: string;
    ZIPCode: string;
    phone: string;
    distance: number;
    latitude: number;
    longitude: number;
    hours: Array<{
      dayOfWeek: string;
      opens: string;
      closes: string;
    }>;
    services: string[];
  }>;
}

interface USPSTrackingResponse {
  trackingNumber: string;
  additionalInfo: string;
  ADPScripting: string;
  archiveRestoreInfo: string;
  associatedLabel: string;
  carrierRelease: boolean;
  mailClass: string;
  mailType: string;
  originCity: string;
  originState: string;
  originZip: string;
  destCity: string;
  destState: string;
  destZip: string;
  expectedDeliveryDate: string;
  expectedDeliveryTime: string;
  guaranteedDeliveryDate: string;
  itemShape: string;
  kahalaIndicator: boolean;
  onTime: boolean;
  predictedDeliveryDate: string;
  predictedDeliveryTime: string;
  TABLECODE: string;
  valueofArticle: string;
  trackSummary: {
    eventDate: string;
    eventTime: string;
    event: string;
    eventCity: string;
    eventState: string;
    eventZIPCode: string;
    eventCountry: string;
    firmName: string;
    name: string;
    authorizedAgent: boolean;
    eventCode: string;
    deliveryAttributeCode: string;
  };
  trackDetail: Array<{
    eventDate: string;
    eventTime: string;
    event: string;
    eventCity: string;
    eventState: string;
    eventZIPCode: string;
    eventCountry: string;
    firmName: string;
    name: string;
    authorizedAgent: boolean;
    eventCode: string;
    deliveryAttributeCode: string;
  }>;
}

const USPS_SERVICE_TYPES: Record<string, string> = {
  priority: 'PRIORITY',
  priority_express: 'PRIORITY_EXPRESS',
  first_class: 'FIRST_CLASS',
  parcel_select: 'PARCEL_SELECT',
  media_mail: 'MEDIA_MAIL',
  library_mail: 'LIBRARY_MAIL',
  ground_advantage: 'USPS_GROUND_ADVANTAGE',
  priority_mail_return: 'PRIORITY_MAIL_RETURN_SERVICE',
};

const USPS_SERVICE_NAMES: Record<string, string> = {
  PRIORITY: 'USPS Priority Mail',
  PRIORITY_EXPRESS: 'USPS Priority Mail Express',
  FIRST_CLASS: 'USPS First-Class Mail',
  PARCEL_SELECT: 'USPS Parcel Select',
  MEDIA_MAIL: 'USPS Media Mail',
  LIBRARY_MAIL: 'USPS Library Mail',
  USPS_GROUND_ADVANTAGE: 'USPS Ground Advantage',
  PRIORITY_MAIL_RETURN_SERVICE: 'USPS Priority Mail Return Service',
};

function mapUSPSEventCodeToStatus(eventCode: string): TrackingEventCode {
  // USPS event codes are two-character codes
  const code = eventCode.toUpperCase();

  // Delivered
  if (code === '01' || code === 'DL' || code === 'DE') return 'delivered';

  // Out for delivery
  if (code === 'OF' || code === 'OD' || code === '07') return 'out_for_delivery';

  // Picked up / accepted
  if (code === 'PU' || code === 'A1' || code === 'AC' || code === '03') {
    return 'picked_up';
  }

  // Created / electronic info received
  if (
    code === 'MA' ||
    code === 'GX' ||
    code === 'CT' ||
    code === '80' ||
    code === '81' ||
    code === 'SF'
  ) {
    return 'created';
  }

  // Exception / alert
  if (
    code === 'NT' ||
    code === '21' ||
    code === '04' ||
    code === '05' ||
    code === '09' ||
    code === '10' ||
    code === '14' ||
    code === '15' ||
    code === '16' ||
    code === 'RE'
  ) {
    return 'exception';
  }

  // Return to sender
  if (code === 'RS' || code === '17' || code === '26') return 'returned';

  // In transit (default for arrival/departure scans)
  if (
    code === '02' ||
    code === '06' ||
    code === '08' ||
    code === '10' ||
    code === 'AR' ||
    code === 'IT' ||
    code === 'OA' ||
    code === 'T1'
  ) {
    return 'in_transit';
  }

  return 'in_transit';
}

function parseUSPSDateTime(dateStr: string, timeStr: string): Date {
  // USPS dates: "March 25, 2026" or "2026-03-25", times: "10:30 am" or "10:30"
  try {
    if (dateStr.includes('-')) {
      // ISO-ish format
      const combined = timeStr ? `${dateStr}T${timeStr}` : dateStr;
      return new Date(combined);
    }
    // Natural language format
    const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr;
    return new Date(combined);
  } catch {
    return new Date(dateStr);
  }
}

function buildUSPSAddress(address: Address): Record<string, string> {
  const result: Record<string, string> = {
    firstName: address.name.split(' ')[0] || address.name,
    lastName: address.name.split(' ').slice(1).join(' ') || address.name,
    streetAddress: address.street1,
    city: address.city,
    state: address.state,
    ZIPCode: address.zip.split('-')[0],
  };

  if (address.street2) {
    result.secondaryAddress = address.street2;
  }

  if (address.zip.includes('-')) {
    result.ZIPPlus4 = address.zip.split('-')[1];
  }

  if (address.company) {
    result.firm = address.company;
  }

  if (address.phone) {
    result.phone = address.phone;
  }

  if (address.email) {
    result.email = address.email;
  }

  return result;
}

export class USPSProvider extends BaseCarrierProvider {
  readonly carrierId: CarrierCode = 'usps';
  readonly name = 'USPS';

  private userId: string;
  private apiKey: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    super('https://api.usps.com');

    const userId = process.env.USPS_USER_ID;
    const apiKey = process.env.USPS_API_KEY;

    if (!userId || !apiKey) {
      throw new CarrierError(
        'Missing required USPS environment variables: USPS_USER_ID, USPS_API_KEY',
        'usps',
        'CONFIGURATION_ERROR',
      );
    }

    this.userId = userId;
    this.apiKey = apiKey;
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    this.logger.info('Authenticating with USPS API');

    const response = await this.makeRequest<USPSOAuthTokenResponse>(
      '/oauth2/v3/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.userId,
          client_secret: this.apiKey,
          scope: 'labels tracking pickups locations',
        }).toString(),
      },
    );

    this.accessToken = response.access_token;
    this.tokenExpiresAt = Date.now() + response.expires_in * 1000;

    this.logger.info('USPS API token acquired successfully');

    return this.accessToken;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authenticate();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-USPS-User-Id': this.userId,
    };
  }

  async createLabel(request: LabelRequest): Promise<ShippingLabel> {
    const headers = await this.getAuthHeaders();

    const serviceType = request.serviceType
      ? USPS_SERVICE_TYPES[request.serviceType] || request.serviceType
      : request.isReturn
        ? 'PRIORITY_MAIL_RETURN_SERVICE'
        : 'PRIORITY';

    const sender = request.isReturn ? request.to : request.from;
    const recipient = request.isReturn ? request.from : request.to;

    const labelPayload = {
      imageInfo: {
        imageType: 'PDF',
        labelType: 'LABEL_4X6',
        receiptOption: 'SEPARATE_PAGE',
      },
      toAddress: {
        ...buildUSPSAddress(recipient),
      },
      fromAddress: {
        ...buildUSPSAddress(sender),
      },
      packageDescription: {
        weightInOunces: Math.round(request.package.weight * 16),
        length: request.package.length,
        height: request.package.height,
        width: request.package.width,
        girth: 0,
        mailClass: serviceType,
        processingCategory: 'NON_MACHINABLE',
        rateIndicator: 'SP',
        destinationEntryFacilityType: 'NONE',
        ...(request.package.description
          ? { contentDescription: request.package.description }
          : {}),
        ...(request.package.value
          ? { customsValue: request.package.value }
          : {}),
      },
      ...(request.isReturn
        ? {
            returnAddress: buildUSPSAddress(sender),
            isReturnLabel: true,
          }
        : {}),
      ...(request.referenceNumber
        ? { customerReference: request.referenceNumber }
        : {}),
    };

    this.logger.info(
      { serviceType, isReturn: request.isReturn },
      'Creating USPS shipping label',
    );

    const response = await this.makeRequest<USPSLabelResponse>(
      '/labels/v3/label',
      {
        method: 'POST',
        headers,
        body: labelPayload,
      },
    );

    const labelData = Buffer.from(response.labelImage, 'base64');
    const postage = response.labelMetadata.postage;
    const extraServicesTotal = (response.labelMetadata.extraServices || []).reduce(
      (sum, svc) => sum + svc.price,
      0,
    );

    return {
      trackingNumber: response.labelMetadata.trackingNumber,
      carrierId: 'usps',
      labelUrl: '',
      labelFormat: 'PDF',
      labelData,
      cost: postage + extraServicesTotal,
      currency: 'USD',
      serviceType: USPS_SERVICE_NAMES[serviceType] || serviceType,
    };
  }

  async schedulePickup(request: PickupRequest): Promise<PickupConfirmation> {
    const headers = await this.getAuthHeaders();

    const pickupDate = request.pickupDate.toISOString().split('T')[0];

    // Determine package service type description
    const packageServices: string[] = [];
    if (request.totalWeight > 0) {
      packageServices.push('Priority Mail');
    }

    const pickupPayload = {
      pickupDate,
      pickupAddress: {
        firstName: request.address.name.split(' ')[0] || request.address.name,
        lastName:
          request.address.name.split(' ').slice(1).join(' ') ||
          request.address.name,
        firm: request.address.company || '',
        address: {
          streetAddress: request.address.street1,
          secondaryAddress: request.address.street2 || '',
          city: request.address.city,
          state: request.address.state,
          ZIPCode: request.address.zip.split('-')[0],
          ZIPPlus4: request.address.zip.includes('-')
            ? request.address.zip.split('-')[1]
            : '',
          urbanization: '',
        },
        contact: [
          {
            phone: request.address.phone || '',
            email: request.address.email || '',
          },
        ],
      },
      packages: [
        {
          packageType: 'OTHER',
          packageCount: request.packageCount,
          weight: request.totalWeight,
        },
      ],
      estimatedWeight: request.totalWeight,
      pickupLocation: {
        packageLocation: 'FRONT_DOOR',
        specialInstructions: request.instructions || '',
      },
    };

    this.logger.info(
      { pickupDate, packageCount: request.packageCount },
      'Scheduling USPS pickup',
    );

    const response = await this.makeRequest<USPSPickupResponse>(
      '/pickup/v3/carrier-pickup',
      {
        method: 'POST',
        headers,
        body: pickupPayload,
      },
    );

    return {
      confirmationNumber: response.confirmationNumber,
      carrierId: 'usps',
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
      'Searching for USPS drop-off locations',
    );

    const response = await this.makeRequest<USPSLocationResponse>(
      '/locations/v3/post-office-locations',
      {
        method: 'GET',
        headers,
        body: {
          ZIPCode: zip,
          radius: String(radius),
          offset: '0',
          limit: '20',
          type: 'ALL',
        },
      },
    );

    const postOffices = response.postOffices || [];

    return postOffices.map((office) => ({
      id: office.facilityID,
      carrierId: 'usps' as CarrierCode,
      name: office.facilityName,
      address: {
        name: office.facilityName,
        street1: office.streetAddress,
        city: office.city,
        state: office.state,
        zip: office.ZIPCode,
        country: 'US',
        phone: office.phone,
      },
      distance: office.distance,
      hours: (office.hours || []).map((h) => ({
        day: h.dayOfWeek,
        open: h.opens,
        close: h.closes,
      })),
      services: office.services || [],
      latitude: office.latitude,
      longitude: office.longitude,
    }));
  }

  async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
    const headers = await this.getAuthHeaders();

    this.logger.info({ trackingNumber }, 'Getting USPS tracking status');

    const response = await this.makeRequest<USPSTrackingResponse>(
      `/tracking/v3/tracking/${encodeURIComponent(trackingNumber)}`,
      {
        method: 'GET',
        headers,
        body: {
          expand: 'DETAIL',
        },
      },
    );

    const events: TrackingEvent[] = [];

    // Add the summary event (latest)
    if (response.trackSummary) {
      const summary = response.trackSummary;
      const locationParts: string[] = [];
      if (summary.eventCity) locationParts.push(summary.eventCity);
      if (summary.eventState) locationParts.push(summary.eventState);
      if (summary.eventZIPCode) locationParts.push(summary.eventZIPCode);

      events.push({
        timestamp: parseUSPSDateTime(summary.eventDate, summary.eventTime),
        status: mapUSPSEventCodeToStatus(summary.eventCode),
        description: summary.event,
        location:
          locationParts.length > 0 ? locationParts.join(', ') : undefined,
      });
    }

    // Add detail events
    if (response.trackDetail) {
      for (const detail of response.trackDetail) {
        const locationParts: string[] = [];
        if (detail.eventCity) locationParts.push(detail.eventCity);
        if (detail.eventState) locationParts.push(detail.eventState);
        if (detail.eventZIPCode) locationParts.push(detail.eventZIPCode);

        events.push({
          timestamp: parseUSPSDateTime(detail.eventDate, detail.eventTime),
          status: mapUSPSEventCodeToStatus(detail.eventCode),
          description: detail.event,
          location:
            locationParts.length > 0 ? locationParts.join(', ') : undefined,
        });
      }
    }

    // Sort events newest first
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const currentStatus =
      events.length > 0 ? events[0].status : 'created';

    const estimatedDeliveryDate = response.expectedDeliveryDate
      ? new Date(response.expectedDeliveryDate)
      : response.predictedDeliveryDate
        ? new Date(response.predictedDeliveryDate)
        : undefined;

    const signedBy = response.trackSummary?.name || undefined;

    return {
      trackingNumber,
      carrierId: 'usps',
      currentStatus,
      estimatedDeliveryDate,
      events,
      signedBy: signedBy || undefined,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    const headers = await this.getAuthHeaders();

    this.logger.info({ trackingNumber }, 'Cancelling USPS shipment');

    try {
      await this.makeRequest<{ status: string }>(
        `/labels/v3/label/${encodeURIComponent(trackingNumber)}`,
        {
          method: 'DELETE',
          headers,
        },
      );

      this.logger.info(
        { trackingNumber },
        'USPS label cancelled successfully',
      );
      return true;
    } catch (error) {
      if (error instanceof CarrierError) {
        // USPS returns specific errors for labels that are already used or expired
        if (
          error.code === 'LABEL_ALREADY_USED' ||
          error.code === 'LABEL_NOT_FOUND' ||
          error.code === 'LABEL_EXPIRED'
        ) {
          this.logger.warn(
            { trackingNumber, code: error.code },
            'USPS label cannot be cancelled',
          );
          return false;
        }
      }
      throw error;
    }
  }
}
