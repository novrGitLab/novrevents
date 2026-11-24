/**
 * CSV writer (RFC 4180) with spreadsheet formula-injection protection: a cell that starts with
 * `=`, `+`, `-`, `@`, tab or carriage return is prefixed with an apostrophe so Excel, Sheets and
 * LibreOffice treat it as text rather than executing it.
 */
const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // The BOM makes Excel open UTF-8 files with the right encoding.
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
