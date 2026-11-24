import { constants, createReadStream } from 'node:fs'
import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assertSafeKey, type StorageDriver, type StoredFile } from './types.js'

/**
 * Stores uploads on the local disk. In production the directory must be a persistent volume
 * (Railway: a volume mounted at /data, with STORAGE_LOCAL_DIR=/data/uploads), which assumes a single
 * API instance. Running several instances needs the S3 driver or another shared store.
 */
export class LocalStorage implements StorageDriver {
  readonly name = 'local'
  private readonly root: string

  constructor(directory: string) {
    this.root = path.resolve(directory)
  }

  private resolve(key: string): string {
    assertSafeKey(key)
    const target = path.resolve(this.root, key)
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`)
    }
    return target
  }

  /** Creates the storage root if needed and fails fast when it cannot be written. */
  async verifyWritable(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await access(this.root, constants.W_OK)
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body)
  }

  async get(key: string): Promise<StoredFile | null> {
    const target = this.resolve(key)
    try {
      const info = await stat(target)
      if (!info.isFile()) return null
      return { stream: createReadStream(target), size: info.size }
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }
}
