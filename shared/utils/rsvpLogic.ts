/**
 * Logica condizionale del form RSVP (§3.4) — PURE FUNCTIONS, zero dipendenze.
 *
 * Usata identica da:
 * - client (RsvpFormRenderer): visibilità domande durante la compilazione;
 * - server (publicInvite.service): validazione autoritativa della submission.
 */
import type {
  AttendingStatus,
  RsvpAnswers,
  RsvpAnswerValue,
  RsvpCondition,
  RsvpPerPersonAnswer,
  RsvpQuestion,
} from '../types/ceremly'

/** Mapping POSIZIONALE delle options di 'attendance' (le label sono personalizzabili). */
const ATTENDANCE_CANONICAL = ['yes', 'no', 'maybe'] as const

function isPerPersonAnswer(value: unknown): value is RsvpPerPersonAnswer {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && 'companions' in value
    && Array.isArray((value as RsvpPerPersonAnswer).companions)
  )
}

/** Vuoto = nessuna risposta. NB: `false` e `0` sono risposte valide, non vuote. */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Ritorna il valore "canonico" di una risposta per la valutazione delle condition.
 * - Per 'attendance' mappa la label scelta su 'yes'|'no'|'maybe' (posizionale
 *   sulle options); accetta anche un valore già canonico (es. iniettato dal server).
 * - Per domande perPerson usa `self` (le condition non guardano gli accompagnatori).
 */
export function getCanonicalAnswer(
  q: RsvpQuestion,
  answers: RsvpAnswers,
): string | number | boolean | string[] | null {
  const raw = answers[q.id]
  const value: RsvpAnswerValue | null | undefined = isPerPersonAnswer(raw) ? raw.self : raw
  if (value === undefined || value === null) return null

  if (q.id === 'attendance' && typeof value === 'string') {
    const idx = (q.options ?? []).indexOf(value)
    if (idx >= 0 && idx < ATTENDANCE_CANONICAL.length) return ATTENDANCE_CANONICAL[idx]!
    if ((ATTENDANCE_CANONICAL as readonly string[]).includes(value)) return value
    return null
  }
  return value
}

function matchesCondition(
  value: string | number | boolean | string[] | null,
  condition: RsvpCondition,
): boolean {
  if (value === null) return false
  switch (condition.op) {
    case 'gt':
      // confronto numerico: array/string non numeriche → NaN → false
      return Number(value) > Number(condition.value)
    case 'eq':
      // per 'multiple' eq = include
      if (Array.isArray(value)) return value.includes(String(condition.value))
      return String(value) === String(condition.value)
    case 'neq':
      if (Array.isArray(value)) return !value.includes(String(condition.value))
      return String(value) !== String(condition.value)
    default:
      return false
  }
}

function isVisibleWithVisited(
  q: RsvpQuestion,
  config: RsvpQuestion[],
  answers: RsvpAnswers,
  visited: Set<string>,
): boolean {
  if (!q.condition) return true
  // protezione dai cicli (q1 → q2 → q1): una catena circolare non è mai visibile
  if (visited.has(q.id)) return false
  visited.add(q.id)

  const ref = config.find(c => c.id === q.condition!.questionId)
  // condition su domanda inesistente → nascosta (fail-closed)
  if (!ref) return false
  // la domanda referenziata deve essere a sua volta visibile
  if (!isVisibleWithVisited(ref, config, answers, visited)) return false

  return matchesCondition(getCanonicalAnswer(ref, answers), q.condition!)
}

/**
 * Una domanda è visibile se: senza condition → true; con condition → la domanda
 * referenziata è visibile E il suo valore canonico soddisfa op/value.
 */
export function isQuestionVisible(
  q: RsvpQuestion,
  config: RsvpQuestion[],
  answers: RsvpAnswers,
): boolean {
  return isVisibleWithVisited(q, config, answers, new Set())
}

/** Filtra le domande visibili preservando l'ordine di config (ordine di rendering). */
export function getVisibleQuestions(
  config: RsvpQuestion[],
  answers: RsvpAnswers,
): RsvpQuestion[] {
  return config.filter(q => isQuestionVisible(q, config, answers))
}

/** Type-check di un singolo valore rispetto al tipo della domanda. Null = ok. */
function checkValueType(q: RsvpQuestion, value: RsvpAnswerValue): string | null {
  switch (q.type) {
    case 'text':
      if (typeof value !== 'string') return `Valore non valido per «${q.label}».`
      return null
    case 'single':
      if (typeof value !== 'string' || !(q.options ?? []).includes(value)) {
        return `Opzione non valida per «${q.label}».`
      }
      return null
    case 'multiple':
      if (
        !Array.isArray(value)
        || value.some(v => typeof v !== 'string' || !(q.options ?? []).includes(v))
      ) {
        return `Opzioni non valide per «${q.label}».`
      }
      return null
    case 'number': {
      const min = q.min ?? 0
      const max = q.max ?? 4
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `Valore non valido per «${q.label}».`
      }
      if (value < min || value > max) {
        return `Il valore di «${q.label}» deve essere tra ${min} e ${max}.`
      }
      return null
    }
    case 'boolean':
      if (typeof value !== 'boolean') return `Valore non valido per «${q.label}».`
      return null
    default:
      return `Tipo di domanda non riconosciuto per «${q.label}».`
  }
}

/**
 * Validazione (server-side autoritativa, riusabile client-side) della submission.
 *
 * Regole (§3.4):
 * - attendance presente e valida;
 * - le chiavi di `answers` non presenti in config sono SCARTATE (no injection);
 * - required verificato solo sulle domande VISIBILI;
 * - con attending='no' nessuna domanda è obbligatoria oltre attendance;
 * - perPerson: companions dimensionato a companionsCount;
 * - type-check dei valori e opzioni dentro options[].
 *
 * Errori in italiano, pensati per essere mostrati all'ospite.
 */
export function validateRsvpSubmission(
  config: RsvpQuestion[],
  payload: { attending: AttendingStatus, companionsCount: number, answers: RsvpAnswers },
): { ok: true } | { ok: false, errors: string[] } {
  const errors: string[] = []

  if (!payload || !(ATTENDANCE_CANONICAL as readonly string[]).includes(payload.attending)) {
    return { ok: false, errors: ['Risposta di partecipazione mancante o non valida.'] }
  }
  if (!Number.isInteger(payload.companionsCount) || payload.companionsCount < 0) {
    return { ok: false, errors: ['Numero di accompagnatori non valido.'] }
  }

  const companionsCount = payload.companionsCount
  const knownIds = new Set(config.map(q => q.id))

  // Scarta le chiavi non presenti in config e lavora su una copia.
  const answers: RsvpAnswers = {}
  for (const [key, value] of Object.entries(payload.answers ?? {})) {
    if (knownIds.has(key) && value !== undefined) answers[key] = value as RsvpAnswers[string]
  }
  // Inietta i valori autoritativi del payload per la valutazione delle condition
  // (getCanonicalAnswer accetta il valore canonico per 'attendance').
  if (knownIds.has('attendance')) answers.attendance = payload.attending
  if (knownIds.has('companions_count') && answers.companions_count === undefined) {
    answers.companions_count = companionsCount
  }

  const skipRequired = payload.attending === 'no'

  for (const q of getVisibleQuestions(config, answers)) {
    if (q.id === 'attendance') continue // già validata via payload.attending
    const raw = answers[q.id]

    if (q.perPerson) {
      const scope = q.perPersonScope ?? 'all'

      if (raw !== undefined && !isPerPersonAnswer(raw)) {
        errors.push(`Formato della risposta non valido per «${q.label}».`)
        continue
      }
      const perPerson = raw as RsvpPerPersonAnswer | undefined

      if (perPerson) {
        if (perPerson.companions.length > companionsCount) {
          errors.push(`Le risposte di «${q.label}» superano il numero di accompagnatori indicato.`)
          continue
        }
        if (scope !== 'companions' && !isEmptyValue(perPerson.self)) {
          const err = checkValueType(q, perPerson.self as RsvpAnswerValue)
          if (err) errors.push(err)
        }
        for (const companionValue of perPerson.companions) {
          if (isEmptyValue(companionValue)) continue
          const err = checkValueType(q, companionValue)
          if (err) {
            errors.push(err)
            break
          }
        }
      }

      if (q.required && !skipRequired) {
        if (scope !== 'companions' && isEmptyValue(perPerson?.self)) {
          errors.push(`La risposta a «${q.label}» è obbligatoria.`)
        }
        const companions = perPerson?.companions ?? []
        if (
          companionsCount > 0
          && (companions.length < companionsCount
            || companions.slice(0, companionsCount).some(v => isEmptyValue(v)))
        ) {
          errors.push(`Compila «${q.label}» per ogni accompagnatore.`)
        }
      }
      continue
    }

    // Domanda normale (valore piatto)
    if (raw !== undefined && isPerPersonAnswer(raw)) {
      errors.push(`Formato della risposta non valido per «${q.label}».`)
      continue
    }
    if (q.required && !skipRequired && isEmptyValue(raw)) {
      errors.push(`La risposta a «${q.label}» è obbligatoria.`)
      continue
    }
    if (!isEmptyValue(raw)) {
      const err = checkValueType(q, raw as RsvpAnswerValue)
      if (err) errors.push(err)
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}
