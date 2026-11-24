import { createRequire } from 'node:module'
import path from 'node:path'
import PDFDocument from 'pdfkit'

// DejaVu covers Latin Extended, Vietnamese-range diacritics, Greek and Cyrillic, so participant
// names such as "Ọláyẹmí" or "Đặng" render correctly. PDF's built-in fonts cannot draw them.
const require = createRequire(import.meta.url)
const fontDirectory = path.join(
  path.dirname(require.resolve('dejavu-fonts-ttf/package.json')),
  'ttf',
)

const FONT_FILES = {
  sans: 'DejaVuSans.ttf',
  'sans-bold': 'DejaVuSans-Bold.ttf',
  serif: 'DejaVuSerif.ttf',
  'serif-bold': 'DejaVuSerif-Bold.ttf',
  'serif-italic': 'DejaVuSerif-Italic.ttf',
  mono: 'DejaVuSansMono.ttf',
} as const

export type PdfFont = keyof typeof FONT_FILES

export interface PdfHandle {
  doc: PDFKit.PDFDocument
  /** Resolves with the finished file once `doc.end()` has been called. */
  finished: Promise<Buffer>
}

export function createPdf(options: PDFKit.PDFDocumentOptions & { title: string }): PdfHandle {
  const { title, ...documentOptions } = options
  const doc = new PDFDocument({
    ...documentOptions,
    info: { Title: title, Creator: 'NOVR Events', Producer: 'NOVR Events' },
  })
  for (const [name, file] of Object.entries(FONT_FILES)) {
    doc.registerFont(name, path.join(fontDirectory, file))
  }
  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  return { doc, finished }
}

const DEFAULT_ACCENT = '#0b7285'

/** A safe 6-digit hex colour, falling back to the platform accent. */
export function accentOf(color: string | null | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_ACCENT
}

/** A filename that is safe in a Content-Disposition header on every platform. */
export function downloadName(base: string, extension: string): string {
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return `${cleaned || 'download'}.${extension}`
}
