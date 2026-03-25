import sharp from 'sharp';
import QRCode from 'qrcode';
import pino from 'pino';

import {
  BaseCarrierProvider,
  CarrierCode,
  LabelRequest,
  ShippingLabel,
  CarrierError,
} from '../providers/base';
import { LabelStorage } from './storage';

/**
 * Tracking URL templates for each supported carrier.
 */
const TRACKING_URLS: Record<CarrierCode, string> = {
  ups: 'https://www.ups.com/track?tracknum={num}',
  fedex: 'https://www.fedex.com/fedextrack/?trknbr={num}',
  usps: 'https://tools.usps.com/go/TrackConfirmAction?tLabels={num}',
  dhl: 'https://www.dhl.com/us-en/home/tracking.html?tracking-id={num}',
};

/**
 * Minimal PDF wrapper that embeds a PNG image.
 *
 * This produces a valid single-page PDF containing the PNG as an XObject image.
 * The page size matches the image dimensions (1 point = 1 pixel).
 */
function wrapPngInPdf(pngData: Buffer, width: number, height: number): Buffer {
  const imageLength = pngData.length;

  // We build the PDF incrementally, tracking byte offsets for the xref table.
  const objects: string[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  function addObject(content: string): void {
    offsets.push(currentOffset);
    objects.push(content);
    currentOffset += Buffer.byteLength(content, 'binary');
  }

  // Object 1: Catalog
  addObject(
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
  );

  // Object 2: Pages
  addObject(
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
  );

  // Object 3: Page
  addObject(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /XObject << /Img 5 0 R >> >> >>\nendobj\n`,
  );

  // Object 4: Content stream — draw image scaled to page
  const streamContent = `q\n${width} 0 0 ${height} 0 0 cm\n/Img Do\nQ\n`;
  const streamLength = Buffer.byteLength(streamContent, 'binary');
  addObject(
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`,
  );

  // Object 5: Image XObject (PNG embedded as raw stream with FlateDecode)
  // For simplicity we use DCTDecode-style embedding; however PNG data isn't DCT.
  // A more correct approach: embed the raw deflated stream. For a minimal PDF we
  // mark it as a /FlateDecode PNG with the raw PNG bytes. Most PDF readers handle this.
  // Actually, the safest minimal approach: use /ASCIIHexDecode or just raw bytes.
  // We'll embed the PNG as-is and let the reader handle it using /Filter /FlateDecode.
  // NOTE: This is a simplified approach. For production labels, most are already PDF.
  const imageObj = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${imageLength} /Filter /FlateDecode >>\nstream\n`;
  const imageEnd = '\nendstream\nendobj\n';

  // Build header
  const header = '%PDF-1.4\n';
  const headerOffset = Buffer.byteLength(header, 'binary');

  // Recalculate offsets with header
  const adjustedOffsets = offsets.map((o) => o + headerOffset);

  // The image object offset must be calculated from what came before
  const preImageOffset =
    headerOffset + objects.reduce((sum, o) => sum + Buffer.byteLength(o, 'binary'), 0);

  const imageObjOffset = preImageOffset;
  const afterImage =
    preImageOffset +
    Buffer.byteLength(imageObj, 'binary') +
    imageLength +
    Buffer.byteLength(imageEnd, 'binary');

  // Xref table
  const xrefOffset = afterImage;
  const totalObjects = 6; // 0 through 5

  let xref = `xref\n0 ${totalObjects}\n`;
  xref += '0000000000 65535 f \n';
  for (const offset of adjustedOffsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  xref += `${imageObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Trailer
  const trailer = `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // Assemble the PDF
  const parts: Buffer[] = [
    Buffer.from(header, 'binary'),
    ...objects.map((o) => Buffer.from(o, 'binary')),
    Buffer.from(imageObj, 'binary'),
    pngData,
    Buffer.from(imageEnd, 'binary'),
    Buffer.from(xref, 'binary'),
    Buffer.from(trailer, 'binary'),
  ];

  return Buffer.concat(parts);
}

export class LabelGenerator {
  private readonly carriers: Map<CarrierCode, BaseCarrierProvider>;
  private readonly storage: LabelStorage;
  private readonly logger: pino.Logger;

  constructor(
    carriers: Map<CarrierCode, BaseCarrierProvider>,
    storage: LabelStorage,
  ) {
    this.carriers = carriers;
    this.storage = storage;
    this.logger = pino({
      name: 'label-generator',
      level: process.env.LOG_LEVEL ?? 'info',
    });

    this.logger.info(
      { registeredCarriers: Array.from(carriers.keys()) },
      'LabelGenerator initialized',
    );
  }

  /**
   * Generate a shipping label for a return, store it in S3, and create a QR code
   * for convenient mobile drop-off scanning.
   */
  async generateLabel(
    request: LabelRequest,
    carrierId: CarrierCode,
  ): Promise<ShippingLabel & { storedUrl: string; qrCodeUrl: string }> {
    const carrier = this.carriers.get(carrierId);
    if (!carrier) {
      throw new CarrierError(
        `No provider registered for carrier: ${carrierId}`,
        carrierId,
        'PROVIDER_NOT_FOUND',
      );
    }

    this.logger.info(
      { carrierId, isReturn: request.isReturn },
      'Generating label via carrier provider',
    );

    // 1. Delegate to carrier provider
    const label = await carrier.createLabel(request);

    // 2. Convert label to PNG for mobile-friendly viewing if it's a PDF
    let mobileData: Buffer;
    let mobileFormat: string;
    if (label.labelFormat === 'PDF') {
      this.logger.info(
        { trackingNumber: label.trackingNumber },
        'Converting PDF label to PNG for mobile viewing',
      );
      mobileData = await this.convertLabelFormat(label, 'PNG');
      mobileFormat = 'png';
    } else {
      mobileData = label.labelData;
      mobileFormat = label.labelFormat.toLowerCase();
    }

    // 3. Store the original label in S3
    const originalKey = await this.storage.storeLabel(
      label.trackingNumber,
      carrierId,
      label.labelData,
      label.labelFormat.toLowerCase(),
    );

    // 4. Store the mobile-friendly version if different from original
    let mobileKey: string;
    if (label.labelFormat === 'PDF') {
      mobileKey = await this.storage.storeLabel(
        `${label.trackingNumber}_mobile`,
        carrierId,
        mobileData,
        mobileFormat,
      );
    } else {
      mobileKey = originalKey;
    }

    // 5. Generate QR code for mobile drop-off
    const qrCodeData = await this.generateQrCode(label.trackingNumber, carrierId);
    const qrKey = await this.storage.storeLabel(
      `${label.trackingNumber}_qr`,
      carrierId,
      qrCodeData,
      'png',
    );

    // 6. Generate presigned URLs
    const storedUrl = await this.storage.getSignedUrl(originalKey);
    const qrCodeUrl = await this.storage.getSignedUrl(qrKey);

    this.logger.info(
      {
        trackingNumber: label.trackingNumber,
        carrierId,
        originalKey,
        mobileKey,
        qrKey,
      },
      'Label generation complete',
    );

    return {
      ...label,
      storedUrl,
      qrCodeUrl,
    };
  }

  /**
   * Convert a shipping label between supported formats.
   *
   * - PDF to PNG: Renders the PDF page as a PNG image using sharp.
   * - PNG to PDF: Wraps the PNG in a minimal PDF document.
   * - ZPL conversions: Returns the data as-is (ZPL requires specialized thermal printers).
   */
  async convertLabelFormat(
    label: ShippingLabel,
    targetFormat: 'PDF' | 'PNG' | 'ZPL',
  ): Promise<Buffer> {
    const sourceFormat = label.labelFormat;

    if (sourceFormat === targetFormat) {
      this.logger.debug(
        { format: sourceFormat },
        'Source and target formats are identical, returning original data',
      );
      return label.labelData;
    }

    // ZPL conversions — cannot convert to/from ZPL programmatically
    if (sourceFormat === 'ZPL' || targetFormat === 'ZPL') {
      this.logger.warn(
        { sourceFormat, targetFormat, trackingNumber: label.trackingNumber },
        'ZPL format conversion is not supported. ZPL requires specialized thermal printers. Returning raw data as-is.',
      );
      return label.labelData;
    }

    // PDF -> PNG: Use sharp to rasterize
    if (sourceFormat === 'PDF' && targetFormat === 'PNG') {
      this.logger.info(
        { trackingNumber: label.trackingNumber },
        'Converting PDF to PNG using sharp',
      );

      try {
        // sharp can process PDF input when built with poppler/libvips PDF support.
        // We render at a high density for crisp labels.
        const pngBuffer = await sharp(label.labelData, {
          density: 300,
        })
          .png()
          .toBuffer();

        this.logger.info(
          {
            trackingNumber: label.trackingNumber,
            originalSize: label.labelData.length,
            convertedSize: pngBuffer.length,
          },
          'PDF to PNG conversion successful',
        );

        return pngBuffer;
      } catch (error) {
        this.logger.error(
          {
            trackingNumber: label.trackingNumber,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to convert PDF to PNG via sharp, returning original PDF data',
        );
        // Fallback: return the original data so the caller can still use the PDF
        return label.labelData;
      }
    }

    // PNG -> PDF: Wrap PNG in a minimal PDF
    if (sourceFormat === 'PNG' && targetFormat === 'PDF') {
      this.logger.info(
        { trackingNumber: label.trackingNumber },
        'Converting PNG to PDF',
      );

      try {
        const metadata = await sharp(label.labelData).metadata();
        const width = metadata.width ?? 400;
        const height = metadata.height ?? 600;

        // Get raw deflated pixel data for embedding in the PDF
        const rawPixels = await sharp(label.labelData)
          .removeAlpha()
          .raw()
          .toBuffer();

        // Use zlib to deflate the raw pixels for FlateDecode
        const { deflateSync } = await import('zlib');
        const deflatedPixels = deflateSync(rawPixels);

        const pdfBuffer = wrapPngInPdf(deflatedPixels, width, height);

        this.logger.info(
          {
            trackingNumber: label.trackingNumber,
            originalSize: label.labelData.length,
            convertedSize: pdfBuffer.length,
            dimensions: { width, height },
          },
          'PNG to PDF conversion successful',
        );

        return pdfBuffer;
      } catch (error) {
        this.logger.error(
          {
            trackingNumber: label.trackingNumber,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to convert PNG to PDF, returning original PNG data',
        );
        return label.labelData;
      }
    }

    // Should not reach here given the formats we support, but guard anyway
    this.logger.warn(
      { sourceFormat, targetFormat },
      'Unsupported format conversion combination, returning original data',
    );
    return label.labelData;
  }

  /**
   * Generate a QR code PNG containing the carrier's tracking URL.
   *
   * The QR code is sized for comfortable mobile scanning (400x400 pixels)
   * and includes a margin for readability.
   */
  async generateQrCode(
    trackingNumber: string,
    carrierId: CarrierCode,
  ): Promise<Buffer> {
    const urlTemplate = TRACKING_URLS[carrierId];
    if (!urlTemplate) {
      throw new CarrierError(
        `No tracking URL template configured for carrier: ${carrierId}`,
        carrierId,
        'TRACKING_URL_NOT_FOUND',
      );
    }

    const trackingUrl = urlTemplate.replace('{num}', encodeURIComponent(trackingNumber));

    this.logger.info(
      { trackingNumber, carrierId, trackingUrl },
      'Generating QR code for tracking URL',
    );

    try {
      const qrBuffer = await QRCode.toBuffer(trackingUrl, {
        type: 'png',
        width: 400,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      this.logger.info(
        { trackingNumber, carrierId, qrSizeBytes: qrBuffer.length },
        'QR code generated successfully',
      );

      return qrBuffer;
    } catch (error) {
      this.logger.error(
        {
          trackingNumber,
          carrierId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to generate QR code',
      );
      throw new CarrierError(
        `Failed to generate QR code: ${error instanceof Error ? error.message : String(error)}`,
        carrierId,
        'QR_GENERATION_FAILED',
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
