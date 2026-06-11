/**
 * Parsing CSV lato client per l'import ospiti (SPEC §0: il server riceve
 * righe JSON già strutturate). Parser RFC-4180-lite: campi quotati, virgole
 * e newline dentro le quote, escape `""`, terminatori \r\n e \n.
 * PURE FUNCTIONS, zero dipendenze.
 */

export interface CsvError {
  /** Numero di riga 1-based (in mapGuestRows: posizione del record, header incluso). */
  line: number
  reason: string
}

export interface CsvParseResult {
  rows: string[][]
  errors: CsvError[]
}

/** Riga ospite mappata dalle colonne posizionali [nome, cognome, email, telefono, gruppo]. */
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
 * Parsa il testo CSV in righe di campi. Le righe completamente vuote sono
 * scartate. Una quote non chiusa produce un errore (con la riga di apertura)
 * e il contenuto residuo viene comunque restituito come ultimo campo.
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
    // scarta le righe completamente vuote (es. newline finale)
    if (row.some(cell => cell.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"' // escape RFC: "" → "
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
 * Mappa le righe CSV in ospiti. Colonne posizionali: [nome, cognome, email,
 * telefono, gruppo]. Se la prima riga contiene 'nome'/'cognome'/'email'
 * (case-insensitive) è trattata come header e saltata.
 * `line` negli errori = posizione del record nel file (1-based, header incluso).
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
