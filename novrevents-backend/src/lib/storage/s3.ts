import type { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { assertSafeKey, type StorageDriver, type StoredFile } from './types.js'

export interface S3StorageOptions {
  endpoint?: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

/** Works with any S3-compatible service (AWS S3, Contabo Object Storage, MinIO, Cloudflare R2…). */
export class S3Storage implements StorageDriver {
  readonly name = 's3'
  private readonly client: S3Client
  private readonly bucket: string

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    })
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key)
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    )
  }

  async get(key: string): Promise<StoredFile | null> {
    assertSafeKey(key)
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!result.Body) return null
      return { stream: result.Body as Readable, size: result.ContentLength ?? null }
    } catch (error) {
      const name = (error as { name?: string }).name
      if (name === 'NoSuchKey' || name === 'NotFound') return null
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key)
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
