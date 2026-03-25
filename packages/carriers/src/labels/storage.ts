import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pino from 'pino';

const DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS = 604800; // 7 days
const DELETE_BATCH_SIZE = 1000; // S3 DeleteObjects max per request

const CONTENT_TYPE_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  zpl: 'application/octet-stream',
};

export class LabelStorage {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly logger: pino.Logger;

  constructor(
    bucket?: string,
    region?: string,
    prefix?: string,
  ) {
    this.bucket = bucket ?? process.env.S3_LABEL_BUCKET ?? '';
    const resolvedRegion = region ?? process.env.S3_REGION ?? 'us-east-1';
    this.prefix = prefix ?? 'returnclaw';

    if (!this.bucket) {
      throw new Error(
        'S3 bucket name is required. Provide it as a constructor argument or set S3_LABEL_BUCKET environment variable.',
      );
    }

    this.s3 = new S3Client({ region: resolvedRegion });

    this.logger = pino({
      name: 'label-storage',
      level: process.env.LOG_LEVEL ?? 'info',
    });

    this.logger.info(
      { bucket: this.bucket, region: resolvedRegion, prefix: this.prefix },
      'LabelStorage initialized',
    );
  }

  /**
   * Upload label data to S3.
   *
   * @param trackingNumber - The carrier tracking number used in the key path.
   * @param carrierId      - Carrier identifier for the key prefix.
   * @param data           - Raw label bytes to store.
   * @param format         - File format (pdf, png, zpl) used for extension and content type.
   * @returns The S3 object key where the label was stored.
   */
  async storeLabel(
    trackingNumber: string,
    carrierId: string,
    data: Buffer,
    format: string,
  ): Promise<string> {
    const normalizedFormat = format.toLowerCase();
    const key = `${this.prefix}/labels/${carrierId}/${trackingNumber}.${normalizedFormat}`;
    const contentType = CONTENT_TYPE_MAP[normalizedFormat] ?? 'application/octet-stream';

    this.logger.info(
      { key, contentType, sizeBytes: data.length },
      'Storing label in S3',
    );

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
          Metadata: {
            trackingNumber,
            carrierId,
            format: normalizedFormat,
            uploadedAt: new Date().toISOString(),
          },
        }),
      );

      this.logger.info({ key }, 'Label stored successfully');
      return key;
    } catch (error) {
      this.logger.error(
        { key, error: error instanceof Error ? error.message : String(error) },
        'Failed to store label in S3',
      );
      throw error;
    }
  }

  /**
   * Generate a presigned GET URL for an S3 object.
   *
   * @param key       - The S3 object key.
   * @param expiresIn - URL validity in seconds (default 7 days).
   * @returns A presigned URL string.
   */
  async getSignedUrl(
    key: string,
    expiresIn: number = DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS,
  ): Promise<string> {
    this.logger.debug({ key, expiresIn }, 'Generating presigned URL');

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3, command, { expiresIn });

      this.logger.info({ key }, 'Presigned URL generated');
      return url;
    } catch (error) {
      this.logger.error(
        { key, error: error instanceof Error ? error.message : String(error) },
        'Failed to generate presigned URL',
      );
      throw error;
    }
  }

  /**
   * Delete a single object from S3.
   *
   * @param key - The S3 object key to delete.
   */
  async deleteLabel(key: string): Promise<void> {
    this.logger.info({ key }, 'Deleting label from S3');

    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      this.logger.info({ key }, 'Label deleted successfully');
    } catch (error) {
      this.logger.error(
        { key, error: error instanceof Error ? error.message : String(error) },
        'Failed to delete label from S3',
      );
      throw error;
    }
  }

  /**
   * Remove labels whose LastModified date is older than the given threshold.
   *
   * Iterates through all objects under the labels prefix using pagination and
   * batch-deletes expired objects.
   *
   * @param olderThanDays - Delete objects older than this many days.
   * @returns The total count of deleted objects.
   */
  async cleanupExpiredLabels(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    this.logger.info(
      { olderThanDays, cutoffDate: cutoffDate.toISOString() },
      'Starting cleanup of expired labels',
    );

    const labelsPrefix = `${this.prefix}/labels/`;
    let continuationToken: string | undefined;
    let totalDeleted = 0;

    try {
      do {
        const listResponse = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: labelsPrefix,
            ContinuationToken: continuationToken,
          }),
        );

        const contents = listResponse.Contents ?? [];
        continuationToken = listResponse.IsTruncated
          ? listResponse.NextContinuationToken
          : undefined;

        // Collect keys of expired objects
        const expiredKeys: { Key: string }[] = [];
        for (const object of contents) {
          if (!object.Key || !object.LastModified) {
            continue;
          }

          if (object.LastModified < cutoffDate) {
            expiredKeys.push({ Key: object.Key });
          }
        }

        if (expiredKeys.length === 0) {
          continue;
        }

        // Delete in batches of 1000 (S3 limit)
        for (let i = 0; i < expiredKeys.length; i += DELETE_BATCH_SIZE) {
          const batch = expiredKeys.slice(i, i + DELETE_BATCH_SIZE);

          this.logger.debug(
            { batchSize: batch.length },
            'Deleting batch of expired labels',
          );

          const deleteResponse = await this.s3.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: batch, Quiet: true },
            }),
          );

          const errorsInBatch = deleteResponse.Errors ?? [];
          if (errorsInBatch.length > 0) {
            this.logger.warn(
              { errorCount: errorsInBatch.length, errors: errorsInBatch },
              'Some objects failed to delete in batch',
            );
          }

          totalDeleted += batch.length - errorsInBatch.length;
        }
      } while (continuationToken);

      this.logger.info(
        { totalDeleted, olderThanDays },
        'Expired label cleanup completed',
      );
      return totalDeleted;
    } catch (error) {
      this.logger.error(
        {
          totalDeletedSoFar: totalDeleted,
          error: error instanceof Error ? error.message : String(error),
        },
        'Error during expired label cleanup',
      );
      throw error;
    }
  }
}
