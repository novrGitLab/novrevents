import type { FastifyRequest } from 'fastify'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import { randomToken } from './crypto.js'
import { badRequest, payloadTooLarge, unsupportedMedia } from './errors.js'
import { storage } from './storage/index.js'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type ImageKind = 'avatars' | 'banners' | 'logos' | 'speakers'

const IMAGE_SIZES: Record<ImageKind, { width: number; height: number; fit: 'cover' | 'inside' }> = {
  avatars: { width: 400, height: 400, fit: 'cover' },
  speakers: { width: 400, height: 400, fit: 'cover' },
  logos: { width: 512, height: 512, fit: 'inside' },
  banners: { width: 1600, height: 900, fit: 'cover' },
}

export interface UploadedFile {
  buffer: Buffer
  filename: string
  fieldname: string
}

/** Reads exactly one file from a multipart request, enforcing the size limit. */
export async function readSingleUpload(
  request: FastifyRequest,
  maxBytes: number,
): Promise<UploadedFile> {
  if (!request.isMultipart()) throw badRequest('Send the file as multipart/form-data.')
  const part = await request.file({ limits: { fileSize: maxBytes, files: 1 } })
  if (!part) throw badRequest('No file was uploaded.')
  const buffer = await part.toBuffer()
  if (part.file.truncated)
    throw payloadTooLarge(`Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`)
  if (buffer.length === 0) throw badRequest('The uploaded file is empty.')
  return { buffer, filename: part.filename, fieldname: part.fieldname }
}

/**
 * Validates an image by its real content (not its name or declared type) and re-encodes it.
 * Re-encoding normalises the format, caps the dimensions, and drops EXIF metadata such as GPS
 * coordinates, so nothing embedded in the original file reaches other users.
 */
export async function storeImage(kind: ImageKind, buffer: Buffer): Promise<string> {
  const detected = await fileTypeFromBuffer(buffer)
  if (!detected || !IMAGE_MIME_TYPES.has(detected.mime)) {
    throw unsupportedMedia('Upload a JPEG, PNG, or WebP image.')
  }
  const size = IMAGE_SIZES[kind]
  let output: Buffer
  try {
    output = await sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: size.width, height: size.height, fit: size.fit, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    throw unsupportedMedia('The image could not be read. Try a different file.')
  }
  const key = `public/${kind}/${randomToken(18)}.webp`
  await storage.put(key, output, 'image/webp')
  return key
}

// ─── Form uploads ────────────────────────────────────────────────────────────

/** Extension → MIME types accepted for that extension (as detected from the file content). */
const DOCUMENT_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  // Plain-text formats have no signature; they are checked for binary content instead.
  txt: [],
  csv: [],
  md: [],
}

export const ALLOWED_DOCUMENT_EXTENSIONS = Object.keys(DOCUMENT_TYPES)

const TEXT_MIME: Record<string, string> = {
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
}

export interface ValidatedDocument {
  extension: string
  mimeType: string
  safeName: string
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'file'
  const cleaned = base
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._-]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  return (cleaned || 'file').slice(0, 120)
}

/**
 * Checks a form upload: allowed extension, content that matches the extension, and size.
 * Executables, HTML, SVG and other active content are rejected because they are not on the list.
 */
export async function validateDocument(
  buffer: Buffer,
  originalName: string,
  options: { maxBytes: number; allowedExtensions?: string[] },
): Promise<ValidatedDocument> {
  if (buffer.length === 0) throw badRequest('The uploaded file is empty.')
  if (buffer.length > options.maxBytes) {
    throw payloadTooLarge(
      `Files must be ${Math.floor(options.maxBytes / 1024 / 1024)} MB or smaller.`,
    )
  }
  const safeName = sanitizeFilename(originalName)
  const extension = safeName.includes('.')
    ? (safeName.split('.').pop() as string).toLowerCase()
    : ''
  const allowed = options.allowedExtensions?.length
    ? options.allowedExtensions
    : ALLOWED_DOCUMENT_EXTENSIONS
  const expected = DOCUMENT_TYPES[extension]
  if (!expected || !allowed.includes(extension)) {
    throw unsupportedMedia(`Allowed file types: ${allowed.join(', ')}.`)
  }
  const detected = await fileTypeFromBuffer(buffer)
  if (expected.length === 0) {
    // Text formats: must not be a recognised binary format and must not contain NUL bytes.
    if (detected || buffer.includes(0))
      throw unsupportedMedia('The file content does not match its extension.')
    return { extension, mimeType: TEXT_MIME[extension] ?? 'text/plain', safeName }
  }
  if (!detected || !expected.includes(detected.mime)) {
    throw unsupportedMedia('The file content does not match its extension.')
  }
  return { extension, mimeType: detected.mime, safeName }
}

/** Stores a validated form upload under a private, unguessable key. */
export async function storePrivateDocument(
  scope: string,
  buffer: Buffer,
  document: ValidatedDocument,
): Promise<string> {
  const key = `private/${scope}/${randomToken(18)}.${document.extension}`
  await storage.put(key, buffer, document.mimeType)
  return key
}
