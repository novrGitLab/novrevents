import { env } from '../../config/env.js'
import { LocalStorage } from './local.js'
import { S3Storage } from './s3.js'
import type { StorageDriver } from './types.js'

export type { StorageDriver, StoredFile } from './types.js'

function createDriver(): StorageDriver {
  if (env.STORAGE_DRIVER === 's3') {
    return new S3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET as string,
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    })
  }
  return new LocalStorage(env.STORAGE_LOCAL_DIR)
}

export const storage: StorageDriver = createDriver()

/** Deletes objects, ignoring individual failures (the row that referenced them is already gone). */
export async function deleteStoredFiles(keys: Array<string | null | undefined>): Promise<void> {
  const unique = [...new Set(keys.filter((key): key is string => Boolean(key)))]
  await Promise.allSettled(unique.map((key) => storage.delete(key)))
}

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
}

export function contentTypeForKey(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

/** Relative URL for a public asset. It resolves through the frontend's `/api` proxy. */
export function publicFileUrl(key: string | null | undefined): string | null {
  return key ? `/api/v1/files/${key}` : null
}
