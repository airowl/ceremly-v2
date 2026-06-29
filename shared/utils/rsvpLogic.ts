/**
 * RSVP form conditional logic (§3.4) — PURE FUNCTIONS, zero dependencies.
 *
 * Used identically by:
 * - client (RsvpFormRenderer): question visibility during form filling;
 * - server (publicInvite.service): authoritative submission validation.
 */
import type {
  AttendingStatus,
  RsvpAnswers,
  RsvpAnswerValue,
  RsvpCondition,
  RsvpPerPersonAnswer,
  RsvpQuestion,
} from '../types/ceremly'

/** POSITIONAL mapping of 'attendance' options (labels are customisable). */
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

/** Empty = no answer. NB: `false` and `0` are valid answers, not empty. */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Returns the "canonical" value of a response for evaluating conditions.
 * - For 'attendance' maps the chosen label to 'yes'|'no'|'maybe' (positional
 *   on options); also accepts an already-canonical value (e.g. injected by server).
 * - For perPerson questions uses `self` (conditions don't look at companions).
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
      // numeric comparison: array/non-numeric string → NaN → false
      return Number(value) > Number(condition.value)
    case 'eq':
      // for 'multiple' eq = includes
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
  // cycle protection (q1 → q2 → q1): a circular chain is never visible
  if (visited.has(q.id)) return false
  visited.add(q.id)

  const ref = config.find(c => c.id === q.condition!.questionId)
  // condition on a non-existent question → hidden (fail-closed)
  if (!ref) return false
  // the referenced question must itself be visible
  if (!isVisibleWithVisited(ref, config, answers, visited)) return false

  return matchesCondition(getCanonicalAnswer(ref, answers), q.condition!)
}

/**
 * A question is visible if: no condition → true; with condition → the referenced
 * question is visible AND its canonical value satisfies op/value.
 */
export function isQuestionVisible(
  q: RsvpQuestion,
  config: RsvpQuestion[],
  answers: RsvpAnswers,
): boolean {
  return isVisibleWithVisited(q, config, answers, new Set())
}

/** Filters visible questions preserving config order (rendering order). */
export function getVisibleQuestions(
  config: RsvpQuestion[],
  answers: RsvpAnswers,
): RsvpQuestion[] {
  return config.filter(q => isQuestionVisible(q, config, answers))
}

/** Type-check of a single value against the question's type. Null = ok. */
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
 * Authoritative server-side (and reusable client-side) submission validation.
 *
 * Rules (§3.4):
 * - attendance present and valid;
 * - keys in `answers` not present in config are DISCARDED (no injection);
 * - required checked only on VISIBLE questions;
 * - with attending='no' no question is mandatory beyond attendance;
 * - perPerson: companions sized to companionsCount;
 * - type-check of values and options inside options[].
 *
 * Error messages are in Italian, intended to be shown to the guest.
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

  // Discard keys not present in config and work on a copy.
  const answers: RsvpAnswers = {}
  for (const [key, value] of Object.entries(payload.answers ?? {})) {
    if (knownIds.has(key) && value !== undefined) answers[key] = value as RsvpAnswers[string]
  }
  // Inject authoritative payload values for condition evaluation
  // (getCanonicalAnswer accepts the canonical value for 'attendance').
  if (knownIds.has('attendance')) answers.attendance = payload.attending
  if (knownIds.has('companions_count') && answers.companions_count === undefined) {
    answers.companions_count = companionsCount
  }

  const skipRequired = payload.attending === 'no'

  for (const q of getVisibleQuestions(config, answers)) {
    if (q.id === 'attendance') continue // already validated via payload.attending
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

    // Normal question (flat value)
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
