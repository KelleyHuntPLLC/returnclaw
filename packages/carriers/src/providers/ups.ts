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

interface UPSOAuthTokenResponse {
  access_token: string;
  token_type: string;
  issued_at: string;
  client_id: string;
  expires_in: string;
  status: string;
}

interface UPSShipmentResponse {
  ShipmentResponse: {
    Response: {
      ResponseStatus: { Code: string; Description: string };
      Alert?: Array<{ Code: string; Description: string }>;
    };
    ShipmentResults: {
      ShipmentCharges: {
        TotalCharges: { MonetaryValue: string; CurrencyCode: string };
      };
      ShipmentIdentificationNumber: string;
      PackageResults: Array<{
        TrackingNumber: string;
        ServiceOptionsCharges: { MonetaryValue: string };
        ShippingLabel: {
          ImageFormat: { Code: string };
          GraphicImage: string;
        };
      }>;
    };
  };
}

interface UPSPickupResponse {
  PickupCreationResponse: {
    Response: { ResponseStatus: { Code: string; Description: string } };
    PRN: string;
    RateResult?: {
      Disclaimer: string;
      RateType: string;
      CurrencyCode: string;
      ChargeDetail: Array<{ ChargeCode: string; ChargeAmount: string }>;
    };
  };
}

interface UPSLocationResponse {
  LocatorResponse: {
    SearchResults: {
      DropLocation: Array<{
        LocationID: string;
        AddressKeyFormat: {
          ConsigneeName: string;
          AddressLine: string[];
          PoliticalDivision2: string;
          PoliticalDivision1: string;
          PostcodePrimaryLow: string;
          CountryCode: string;
        };
        PhoneNumber?: string;
        Distance: { Value: string; UnitOfMeasurement: { Code: string } };
        OperatingHours: {
          StandardHours: Array<{
            DayOfWeek: { Day: string; OpenHours: string; CloseHours: string };
          }>;
        };
        ServiceOfferingList: {
          ServiceOffering: Array<{ Code: string; Description: string }>;
        };
        Geocode: { Latitude: string; Longitude: string };
        LocationAttribute?: Array<{ OptionCode: { Code: string } }>;
      }>;
    };
  };
}

interface UPSTrackingResponse {
  trackResponse: {
    shipment: Array<{
      package: Array<{
        trackingNumber: string;
        deliveryDate?: Array<{ date: string }>;
        deliveryTime?: { type: string };
        activity: Array<{
          date: string;
          time: string;
          location?: {
            address?: {
              city?: string;
              stateProvince?: string;
              country?: string;
            };
          };
          status: {
            type: string;
            code: string;
            description: string;
          };
        }>;
        currentStatus?: {
          type: string;
          code: string;
          description: string;
        };
      }>;
      signedForByName?: string;
    }>;
  };
}

interface UPSVoidResponse {
  VoidShipmentResponse: {
    Response: { ResponseStatus: { Code: string; Description: string } };
    SummaryResult: { Status: { Code: string; Description: string } };
  };
}

const UPS_SERVICE_CODES: Record<string, string> = {
  ground: '03',
  next_day_air: '01',
  next_day_air_saver: '13',
  next_day_air_early: '14',
  '2nd_day_air': '02',
  '2nd_day_air_am': '59',
  '3_day_select': '12',
  ground_saver: '93',
  standard: '11',
  worldwide_express: '07',
  worldwide_express_plus: '54',
  worldwide_expedited: '08',
  worldwide_saver: '65',
};

const UPS_SERVICE_NAMES: Record<string, string> = {
  '01': 'UPS Next Day Air',
  '02': 'UPS 2nd Day Air',
  '03': 'UPS Ground',
  '07': 'UPS Worldwide Express',
  '08': 'UPS Worldwide Expedited',
  '11': 'UPS Standard',
  '12': 'UPS 3 Day Select',
  '13': 'UPS Next Day Air Saver',
  '14': 'UPS Next Day Air Early',
  '54': 'UPS Worldwide Express Plus',
  '59': 'UPS 2nd Day Air A.M.',
  '65': 'UPS Worldwide Saver',
  '93': 'UPS Ground Saver',
};

const UPS_RETURN_SERVICE_CODE = '9'; // UPS Print Return Label

function mapUPSStatusToEventCode(statusType: string, statusCode: string): TrackingEventCode {
  switch (statusType) {
    case 'M':
      return 'created'; // Manifest/billing information received
    case 'P':
      return 'picked_up'; // Picked up
    case 'I':
      return 'in_transit'; // In transit
    case 'O':
      return 'out_for_delivery'; // Out for delivery
    case 'D':
      return 'delivered'; // Delivered
    case 'X':
      return 'exception'; // Exception
    case 'RS':
      return 'returned'; // Returned to sender
    default:
      break;
  }

  // Fallback based on status code
  if (statusCode === 'KB' || statusCode === 'YP') return 'out_for_delivery';
  if (statusCode === 'DP' || statusCode === 'OT') return 'in_transit';
  if (statusCode === 'OR') return 'created';

  return 'in_transit';
}

function formatDateForUPS(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function parseUPSDate(dateStr: string): Date {
  // UPS dates are YYYYMMDD
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = parseInt(dateStr.substring(6, 8), 10);
  return new Date(year, month, day);
}

function parseUPSDateTime(dateStr: string, timeStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = parseInt(dateStr.substring(6, 8), 10);
  const hour = parseInt(timeStr.substring(0, 2), 10);
  const minute = parseInt(timeStr.substring(2, 4), 10);
  const second = parseInt(timeStr.substring(4, 6), 10) || 0;
  return new Date(year, month, day, hour, minute, second);
}

function buildUPSAddress(address: Address): Record<string, unknown> {
  const result: Record<string, unknown> = {
    Name: address.name,
    AttentionName: address.name,
    Phone: { Number: address.phone || '0000000000' },
    Address: {
      AddressLine: [address.street1, address.street2].filter(Boolean),
      City: address.city,
      StateProvinceCode: address.state,
      PostalCode: address.zip,
      CountryCode: address.country,
    },
  };

  if (address.company) {
    result.CompanyName = address.company;
  }

  if (address.email) {
    result.EMailAddress = address.email;
  }

  return result;
}

export class UPSProvider extends BaseCarrierProvider {
  readonly carrierId: CarrierCode = 'ups';
  readonly name = 'UPS';

  private clientId: string;
  private clientSecret: string;
  private accountNumber: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    super('https://onlinetools.ups.com');

    const clientId = process.env.UPS_CLIENT_ID;
    const clientSecret = process.env.UPS_CLIENT_SECRET;
    const accountNumber = process.env.UPS_ACCOUNT_NUMBER;

    if (!clientId || !clientSecret || !accountNumber) {
      throw new CarrierError(
        'Missing required UPS environment variables: UPS_CLIENT_ID, UPS_CLIENT_SECRET, UPS_ACCOUNT_NUMBER',
        'ups',
        'CONFIGURATION_ERROR',
      );
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accountNumber = accountNumber;
  }

  private async authenticate(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    this.logger.info('Authenticating with UPS OAuth 2.0');

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const response = await this.makeRequest<UPSOAuthTokenResponse>(
      '/security/v1/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: 'grant_type=client_credentials',
      },
    );

    this.accessToken = response.access_token;
    this.tokenExpiresAt = Date.now() + parseInt(response.expires_in, 10) * 1000;

    this.logger.info('UPS OAuth token acquired successfully');

    return this.accessToken;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authenticate();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      transId: `rc-${Date.now()}`,
      transactionSrc: 'ReturnClaw',
    };
  }

  async createLabel(request: LabelRequest): Promise<ShippingLabel> {
    const headers = await this.getAuthHeaders();

    const serviceCode = request.serviceType
      ? UPS_SERVICE_CODES[request.serviceType] || request.serviceType
      : '03'; // Default to Ground

    const shipper = buildUPSAddress(request.from);
    shipper.ShipperNumber = this.accountNumber;

    const shipTo = buildUPSAddress(request.isReturn ? request.from : request.to);
    const shipFrom = buildUPSAddress(request.isReturn ? request.to : request.from);

    const shipmentRequest: Record<string, unknown> = {
      ShipmentRequest: {
        Request: {
          SubVersion: '2205',
          RequestOption: 'nonvalidate',
          TransactionReference: {
            CustomerContext: request.referenceNumber || `rc-${Date.now()}`,
          },
        },
        Shipment: {
          Description: request.package.description || 'Return Shipment',
          Shipper: shipper,
          ShipTo: shipTo,
          ShipFrom: shipFrom,
          PaymentInformation: {
            ShipmentCharge: {
              Type: '01',
              BillShipper: {
                AccountNumber: this.accountNumber,
              },
            },
          },
          Service: {
            Code: serviceCode,
            Description: UPS_SERVICE_NAMES[serviceCode] || 'UPS Service',
          },
          Package: {
            Packaging: { Code: '02', Description: 'Customer Supplied Package' },
            Dimensions: {
              UnitOfMeasurement: { Code: 'IN', Description: 'Inches' },
              Length: String(request.package.length),
              Width: String(request.package.width),
              Height: String(request.package.height),
            },
            PackageWeight: {
              UnitOfMeasurement: { Code: 'LBS', Description: 'Pounds' },
              Weight: String(request.package.weight),
            },
            ...(request.package.value
              ? {
                  PackageServiceOptions: {
                    DeclaredValue: {
                      CurrencyCode: 'USD',
                      MonetaryValue: String(request.package.value),
                    },
                  },
                }
              : {}),
          },
          ...(request.isReturn
            ? {
                ReturnService: { Code: UPS_RETURN_SERVICE_CODE },
              }
            : {}),
          ...(request.referenceNumber
            ? {
                ReferenceNumber: {
                  Code: 'PO',
                  Value: request.referenceNumber,
                },
              }
            : {}),
        },
        LabelSpecification: {
          LabelImageFormat: { Code: 'PDF', Description: 'PDF' },
          LabelStockSize: { Height: '6', Width: '4' },
        },
      },
    };

    this.logger.info(
      { serviceCode, isReturn: request.isReturn },
      'Creating UPS shipment label',
    );

    const response = await this.makeRequest<UPSShipmentResponse>(
      '/api/shipments/v2205/ship',
      {
        method: 'POST',
        headers,
        body: shipmentRequest,
      },
    );

    const shipmentResults = response.ShipmentResponse.ShipmentResults;
    const packageResult = shipmentResults.PackageResults[0];

    if (!packageResult) {
      throw new CarrierError(
        'UPS shipment response did not contain package results',
        'ups',
        'INVALID_RESPONSE',
      );
    }

    const labelData = Buffer.from(
      packageResult.ShippingLabel.GraphicImage,
      'base64',
    );

    const labelFormat =
      packageResult.ShippingLabel.ImageFormat.Code === 'ZPL'
        ? 'ZPL'
        : packageResult.ShippingLabel.ImageFormat.Code === 'PNG'
          ? 'PNG'
          : 'PDF';

    const totalCharges = shipmentResults.ShipmentCharges.TotalCharges;

    // Check for response alerts (warnings)
    const alerts = response.ShipmentResponse.Response.Alert;
    if (alerts && alerts.length > 0) {
      this.logger.warn({ alerts }, 'UPS shipment created with alerts');
    }

    return {
      trackingNumber: packageResult.TrackingNumber,
      carrierId: 'ups',
      labelUrl: '', // UPS returns label data inline, no URL
      labelFormat,
      labelData,
      cost: parseFloat(totalCharges.MonetaryValue),
      currency: totalCharges.CurrencyCode,
      serviceType: UPS_SERVICE_NAMES[serviceCode] || serviceCode,
    };
  }

  async schedulePickup(request: PickupRequest): Promise<PickupConfirmation> {
    const headers = await this.getAuthHeaders();

    const pickupDateStr = formatDateForUPS(request.pickupDate);

    const pickupRequest = {
      PickupCreationRequest: {
        Request: {
          TransactionReference: {
            CustomerContext: `rc-pickup-${Date.now()}`,
          },
        },
        RatePickupIndicator: 'Y',
        Shipper: {
          Account: {
            AccountNumber: this.accountNumber,
            AccountCountryCode: request.address.country,
          },
        },
        PickupDateInfo: {
          CloseTime: request.closeTime.replace(':', ''),
          ReadyTime: request.readyTime.replace(':', ''),
          PickupDate: pickupDateStr,
        },
        PickupAddress: {
          CompanyName: request.address.company || request.address.name,
          ContactName: request.address.name,
          AddressLine: [request.address.street1, request.address.street2].filter(Boolean),
          City: request.address.city,
          StateProvince: request.address.state,
          PostalCode: request.address.zip,
          CountryCode: request.address.country,
          Phone: { Number: request.address.phone || '0000000000' },
        },
        AlternateAddressIndicator: 'N',
        PickupPiece: [
          {
            ServiceCode: '003', // Ground
            Quantity: String(request.packageCount),
            DestinationCountryCode: 'US',
            ContainerCode: '01', // Package
          },
        ],
        TotalWeight: {
          Weight: String(request.totalWeight),
          UnitOfMeasurement: 'LBS',
        },
        OverweightIndicator: request.totalWeight > 70 ? 'Y' : 'N',
        PaymentMethod: '01', // Account-based
        ...(request.instructions
          ? { SpecialInstruction: request.instructions }
          : {}),
      },
    };

    this.logger.info(
      { pickupDate: pickupDateStr, packageCount: request.packageCount },
      'Scheduling UPS pickup',
    );

    const response = await this.makeRequest<UPSPickupResponse>(
      '/api/pickupcreation/v1707/pickup',
      {
        method: 'POST',
        headers,
        body: pickupRequest,
      },
    );

    return {
      confirmationNumber: response.PickupCreationResponse.PRN,
      carrierId: 'ups',
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
      'Searching for UPS drop-off locations',
    );

    const response = await this.makeRequest<UPSLocationResponse>(
      '/api/locations/v2/search/availabilities/64',
      {
        method: 'POST',
        headers,
        body: {
          LocatorRequest: {
            Request: {
              TransactionReference: {
                CustomerContext: `rc-loc-${Date.now()}`,
              },
            },
            OriginAddress: {
              AddressKeyFormat: {
                PostcodePrimaryLow: zip,
                CountryCode: 'US',
              },
            },
            Translate: {
              Locale: 'en_US',
            },
            UnitOfMeasurement: { Code: 'MI' },
            MaximumListSize: '20',
            SearchRadius: String(radius),
            LocationSearchCriteria: {
              SearchOption: [
                { OptionType: { Code: '01' } }, // UPS Store
                { OptionType: { Code: '03' } }, // UPS Access Point
              ],
              MaximumListSize: '20',
              SearchRadius: String(radius),
            },
          },
        },
      },
    );

    const dropLocations =
      response.LocatorResponse?.SearchResults?.DropLocation || [];

    return dropLocations.map((loc) => {
      const addr = loc.AddressKeyFormat;
      const hours = (loc.OperatingHours?.StandardHours || []).map((h) => ({
        day: h.DayOfWeek.Day,
        open: h.DayOfWeek.OpenHours,
        close: h.DayOfWeek.CloseHours,
      }));

      const services = (
        loc.ServiceOfferingList?.ServiceOffering || []
      ).map((s) => s.Description);

      return {
        id: loc.LocationID,
        carrierId: 'ups' as CarrierCode,
        name: addr.ConsigneeName,
        address: {
          name: addr.ConsigneeName,
          street1: addr.AddressLine[0] || '',
          street2: addr.AddressLine[1],
          city: addr.PoliticalDivision2,
          state: addr.PoliticalDivision1,
          zip: addr.PostcodePrimaryLow,
          country: addr.CountryCode,
          phone: loc.PhoneNumber,
        },
        distance: parseFloat(loc.Distance.Value),
        hours,
        services,
        latitude: parseFloat(loc.Geocode.Latitude),
        longitude: parseFloat(loc.Geocode.Longitude),
      };
    });
  }

  async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
    const headers = await this.getAuthHeaders();

    this.logger.info({ trackingNumber }, 'Getting UPS tracking status');

    const response = await this.makeRequest<UPSTrackingResponse>(
      `/api/track/v1/details/${encodeURIComponent(trackingNumber)}`,
      {
        method: 'GET',
        headers,
        body: {
          locale: 'en_US',
          returnSignature: 'true',
        },
      },
    );

    const shipment = response.trackResponse.shipment[0];
    if (!shipment) {
      throw new CarrierError(
        `No tracking data found for ${trackingNumber}`,
        'ups',
        'TRACKING_NOT_FOUND',
      );
    }

    const pkg = shipment.package[0];
    if (!pkg) {
      throw new CarrierError(
        `No package data found for ${trackingNumber}`,
        'ups',
        'TRACKING_NOT_FOUND',
      );
    }

    const events: TrackingEvent[] = (pkg.activity || []).map((activity) => {
      const locationParts: string[] = [];
      if (activity.location?.address?.city) {
        locationParts.push(activity.location.address.city);
      }
      if (activity.location?.address?.stateProvince) {
        locationParts.push(activity.location.address.stateProvince);
      }
      if (activity.location?.address?.country) {
        locationParts.push(activity.location.address.country);
      }

      return {
        timestamp: parseUPSDateTime(activity.date, activity.time),
        status: mapUPSStatusToEventCode(
          activity.status.type,
          activity.status.code,
        ),
        description: activity.status.description,
        location: locationParts.length > 0 ? locationParts.join(', ') : undefined,
      };
    });

    // Sort events newest first
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const currentStatus = pkg.currentStatus
      ? mapUPSStatusToEventCode(pkg.currentStatus.type, pkg.currentStatus.code)
      : events.length > 0
        ? events[0].status
        : 'created';

    const estimatedDeliveryDate =
      pkg.deliveryDate && pkg.deliveryDate.length > 0
        ? parseUPSDate(pkg.deliveryDate[0].date)
        : undefined;

    return {
      trackingNumber,
      carrierId: 'ups',
      currentStatus,
      estimatedDeliveryDate,
      events,
      signedBy: shipment.signedForByName,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    const headers = await this.getAuthHeaders();

    this.logger.info({ trackingNumber }, 'Cancelling UPS shipment');

    try {
      const response = await this.makeRequest<UPSVoidResponse>(
        `/api/shipments/v2205/void/cancel/${encodeURIComponent(trackingNumber)}`,
        {
          method: 'DELETE',
          headers,
        },
      );

      const statusCode =
        response.VoidShipmentResponse.SummaryResult.Status.Code;

      if (statusCode === '1') {
        this.logger.info({ trackingNumber }, 'UPS shipment voided successfully');
        return true;
      }

      this.logger.warn(
        { trackingNumber, statusCode },
        'UPS shipment void returned non-success status',
      );
      return false;
    } catch (error) {
      if (
        error instanceof CarrierError &&
        error.statusCode === 400 &&
        error.code === '190117'
      ) {
        // Shipment has already been voided or picked up
        this.logger.warn(
          { trackingNumber },
          'UPS shipment cannot be voided (already processed)',
        );
        return false;
      }
      throw error;
    }
  }
}
