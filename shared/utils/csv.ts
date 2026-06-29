/**
 * Client-side CSV parsing for guest import (SPEC §0: the server receives
 * already-structured JSON rows). RFC-4180-lite parser: quoted fields, commas
 * and newlines inside quotes, `""` escape, \r\n and \n terminators.
 * PURE FUNCTIONS, zero dependencies.
 */

export interface CsvError {
  /** 1-based line number (in mapGuestRows: record position, header included). */
  line: number
  reason: string
}

export interface CsvParseResult {
  rows: string[][]
  errors: CsvError[]
}

/** Guest row mapped from positional columns [nome, cognome, email, telefono, gruppo]. */
export interface CsvGuestRow {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  groupName?: string
}

export interface MapGuestRowsResult {
  guests: CsvGuestRow[]
  errors: CsvError[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Parses CSV text into rows of fields. Completely blank rows are discarded.
 * An unclosed quote produces an error (with the opening line) and the
 * remaining content is still returned as the last field.
 */
export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = []
  const errors: CsvError[] = []

  let row: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let quoteOpenLine = 1

  const pushRow = () => {
    row.push(field)
    field = ''
    // discard completely blank rows (e.g. trailing newline)
    if (row.some(cell => cell.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"' // RFC escape: "" → "
          i++
        } else {
          inQuotes = false
        }
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      quoteOpenLine = line
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      pushRow()
      line++
    } else {
      field += ch
    }
  }

  if (inQuotes) {
    errors.push({ line: quoteOpenLine, reason: 'Virgolette non chiuse: controlla il campo che inizia su questa riga' })
  }
  if (field !== '' || row.length > 0) pushRow()

  return { rows, errors }
}

/**
 * Maps CSV rows to guests. Positional columns: [nome, cognome, email,
 * telefono, gruppo]. If the first row contains 'nome'/'cognome'/'email'
 * (case-insensitive) it is treated as a header and skipped.
 * `line` in errors = record position in the file (1-based, header included).
 */
export function mapGuestRows(rows: string[][]): MapGuestRowsResult {
  const guests: CsvGuestRow[] = []
  const errors: CsvError[] = []

  if (rows.length === 0) {
    return { guests, errors: [{ line: 1, reason: 'Il file è vuoto' }] }
  }

  const headerWords = ['nome', 'cognome', 'email']
  const firstRow = rows[0]!.map(cell => cell.trim().toLowerCase())
  const hasHeader = firstRow.some(cell => headerWords.some(word => cell.includes(word)))
  const startIndex = hasHeader ? 1 : 0

  for (let i = startIndex; i < rows.length; i++) {
    const line = i + 1
    const cells = rows[i]!.map(cell => cell.trim())
    const [firstName, lastName, email, phone, groupName] = cells

    if (!firstName || !lastName) {
      errors.push({ line, reason: 'Nome o cognome mancante' })
      continue
    }
    if (email && !EMAIL_RE.test(email)) {
      errors.push({ line, reason: `Email non valida: "${email}"` })
      continue
    }

    guests.push({
      firstName,
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      groupName: groupName || undefined,
    })
  }

  if (guests.length === 0 && errors.length === 0) {
    errors.push({ line: startIndex + 1, reason: 'Nessun ospite trovato nel file' })
  }

  return { guests, errors }
}
